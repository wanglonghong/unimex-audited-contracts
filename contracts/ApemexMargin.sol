/*

_____/\\\\\\\\\__________________________________/\\\\____________/\\\\______________________________        
 ___/\\\\\\\\\\\\\_______________________________\/\\\\\\________/\\\\\\______________________________       
  __/\\\/////////\\\___/\\\\\\\\\_________________\/\\\//\\\____/\\\//\\\______________________________      
   _\/\\\_______\/\\\__/\\\/////\\\_____/\\\\\\\\__\/\\\\///\\\/\\\/_\/\\\_____/\\\\\\\\___/\\\____/\\\_     
    _\/\\\\\\\\\\\\\\\_\/\\\\\\\\\\____/\\\/////\\\_\/\\\__\///\\\/___\/\\\___/\\\/////\\\_\///\\\/\\\/__    
     _\/\\\/////////\\\_\/\\\//////____/\\\\\\\\\\\__\/\\\____\///_____\/\\\__/\\\\\\\\\\\____\///\\\/____   
      _\/\\\_______\/\\\_\/\\\_________\//\\///////___\/\\\_____________\/\\\_\//\\///////______/\\\/\\\___  
       _\/\\\_______\/\\\_\/\\\__________\//\\\\\\\\\\_\/\\\_____________\/\\\__\//\\\\\\\\\\__/\\\/\///\\\_ 
        _\///________\///__\///____________\//////////__\///______________\///____\//////////__\///____\///__

Margin V2.3 (upgradeable dex address, config contract, owed and input params in the OnOpenPositionEvent)

*/

// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Uniswap.sol";
import "./interfaces/IUniMexFactory.sol";
import "./interfaces/IUniMexPool.sol";
import "./interfaces/ISwapPathCreator.sol";
import "./interfaces/IUniMexStaking.sol";
import "./interfaces/IUnimexConfig.sol";

/**
 * Margin contract. Does not support tokens with fees on transfers
 */
contract ApeMexMargin is AccessControl, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeMath for uint32;
    using SafeERC20 for IERC20;

    struct Position {
        uint256 owed;
        uint256 input;
        uint256 commitment;
        address token;
        bool isShort;
        uint32 startTimestamp;
        uint32 borrowInterest;
        address owner;
        uint32 stopLossPercent;
        uint32 takeProfitPercent;
    }

    struct Limit {
        uint256 amount;
        uint256 minimalSwapAmount;
        address token;
        bool isShort;
        uint32 validBefore;
        uint32 leverageScaled;
        address owner;
        uint32 takeProfitPercent;
        uint32 stopLossPercent;
        uint256 escrowAmount;
    }

    uint256 public constant YEAR = 31536000;

    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

    address private immutable BASE_TOKEN_ADDRESS;
    IERC20 public immutable BASE_TOKEN;

    address public immutable WETH_ADDRESS;

    uint256 private constant MAG = 1e18;
    uint256 public constant LIQUIDATION_MARGIN = 1.1e18; //10%
    uint256 public thresholdGasPrice = 3e8; //gas price in wei used to calculate bonuses for liquidation, sl, tp
    uint32 public borrowInterestPercentScaled = 500; //50%
    uint256 public positionNonce = 0;
    bool public paused = false;

    uint256 public amountThresholds;

    address public apeswapAmmFeesAddress;
    address public projectFeesAddress;

    
    mapping(bytes32 => Position) public positionInfo;
    mapping(bytes32 => Limit) public limitOrders;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public escrow;
    
    IUniMexStaking public staking;
    IUniMexFactory public immutable unimex_factory;
    IUniswapV2Factory public uniswap_factory;
    IUniswapV2Router02 public uniswap_router;
    ISwapPathCreator public swapPathCreator;
    IUnimexConfig public immutable unimexConfig;

    event OnClosePosition(
        bytes32 indexed positionId,
        address token,
        address indexed owner,
        uint256 owed,
        uint256 input,
        uint256 commitment,
        uint32 startTimestamp,
        bool isShort,
        uint256 borrowInterest,
        uint256 liquidationBonus, //amount that went to liquidator when position was liquidated. 0 if position was closed
        uint256 scaledCloseRate // busd/token multiplied by 1e18
    );

    event OnOpenPosition(
        address indexed sender,
        bytes32 positionId,
        bool isShort,
        address indexed token,
        uint256 scaledLeverage,
        uint256 owed,
        uint256 input,
        uint32 takeProfitPercent,
        uint32 stopLossPercent
    );

    event OnAddCommitment(
        bytes32 indexed positionId,
        uint256 amount
    );

    event OnLimitOrder(
        bytes32 indexed limitOrderId,
        address indexed owner,
        address token,
        uint256 amount,
        uint256 minimalSwapAmount,
        uint256 leverageScaled,
        uint32 validBefore,
        uint256 escrowAmount,
        uint32 takeProfitPercent,
        uint32 stopLossPercent,
        bool isShort
    );

    event OnLimitOrderCancelled(
        bytes32 indexed limitOrderId
    );

    event OnLimitOrderCompleted(
        bytes32 indexed limitOrderId,
        bytes32 positionId
    );

    event OnTakeProfit(
        bytes32 indexed positionId,
        uint256 positionInput,
        uint256 swapAmount,
        address token,
        bool isShort
    );

    event OnStopLoss(
        bytes32 indexed positionId,
        uint256 positionInput,
        uint256 swapAmount,
        address token,
        bool isShort
    );

    //to prevent flashloans
    modifier isHuman() {
        require(msg.sender == tx.origin);
        _;
    }

    constructor(
        address _staking,
        address _factory,
        address _busd,
        address _weth,
        address _uniswap_factory,
        address _uniswap_router,
        address _swapPathCreator,
        address _unimexConfig,
        address _apeswapAmmFeesAddress,
        address _projectFeesAddress
    ) public {
        staking = IUniMexStaking(_staking);
        unimex_factory = IUniMexFactory(_factory);
        BASE_TOKEN_ADDRESS = _busd;
        BASE_TOKEN = IERC20(_busd);
        uniswap_factory = IUniswapV2Factory(_uniswap_factory);
        uniswap_router = IUniswapV2Router02(_uniswap_router);
        swapPathCreator = ISwapPathCreator(_swapPathCreator);
        unimexConfig = IUnimexConfig(_unimexConfig);
        apeswapAmmFeesAddress = _apeswapAmmFeesAddress;
        projectFeesAddress = _projectFeesAddress;

        WETH_ADDRESS = _weth;

        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        amountThresholds = 275;
    }

    function deposit(uint256 _amount) public {
        BASE_TOKEN.safeTransferFrom(msg.sender, address(this), _amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].add(_amount);
    }

    function withdraw(uint256 _amount) public {
        require(balanceOf[msg.sender] >= _amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(_amount);
        BASE_TOKEN.safeTransfer(msg.sender, _amount);
    }

    function openShortPosition(address token, uint256 amount, uint256 scaledLeverage, uint256 minimalSwapAmount) public isHuman {
        uint256[5] memory values = [amount, scaledLeverage, minimalSwapAmount, 0, 0];
        _openPosition(msg.sender, token, true, values);
    }

    function openLongPosition(address token, uint256 amount, uint256 scaledLeverage, uint256 minimalSwapAmount) public isHuman {
        uint256[5] memory values = [amount, scaledLeverage, minimalSwapAmount, 0, 0];
        _openPosition(msg.sender, token, false, values);
    }

    function openShortPositionWithSlTp(address token, uint256 amount, uint256 scaledLeverage, uint256 minimalSwapAmount,
        uint256 takeProfitPercent, uint256 stopLossPercent) public isHuman {
        uint256[5] memory values = [amount, scaledLeverage, minimalSwapAmount, takeProfitPercent, stopLossPercent];
        _openPosition(msg.sender, token, true, values);
    }

    function openLongPositionWithSlTp(address token, uint256 amount, uint256 scaledLeverage, uint256 minimalSwapAmount,
            uint256 takeProfitPercent, uint256 stopLossPercent) public isHuman {
        uint256[5] memory values = [amount, scaledLeverage, minimalSwapAmount, takeProfitPercent, stopLossPercent];
        _openPosition(msg.sender, token, false, values);
    }

    /**
    * values[0] amount
    * values[1] scaledLeverage
    * values[2] minimalSwapAmount
    * values[3] takeProfitPercent
    * values[4] stopLossPercent
    */
    function _openPosition(address owner, address token, bool isShort, uint256[5] memory values)
                                                                        private nonReentrant returns (bytes32) {
        require(!paused, "PAUSED");
        require(values[0] > 0, "ZERO AMOUNT");
        require(values[4] < 1e6, "STOPLOSS EXCEEDS MAX");
        address pool = unimex_factory.getPool(address(isShort ? IERC20(token) : BASE_TOKEN));

        require(pool != address(0), "POOL DOES NOT EXIST");
        require(values[1] <= unimexConfig.getMaxLeverage(token).mul(MAG), "LEVERAGE EXCEEDS MAX");

        uint256 amountInBusd = isShort ? swapPathCreator.calculateConvertedValue(token, BASE_TOKEN_ADDRESS, values[0]) : values[0];
        uint256 commitment = getCommitment(amountInBusd, values[1]);
        uint256 commitmentWithLb = commitment.add(calculateAutoCloseBonus());
        require(balanceOf[owner] >= commitmentWithLb, "NO BALANCE");

        IUniMexPool(pool).borrow(values[0]);

        uint256 swap;

        {
        (address baseToken, address quoteToken) = isShort ? (token, BASE_TOKEN_ADDRESS) : (BASE_TOKEN_ADDRESS, token);
        swap = swapTokens(baseToken, quoteToken, values[0]);
        require(swap >= values[2], "INSUFFICIENT SWAP");
        }

        uint256 fees = (swap.mul(2)).div(1000);

        swap = swap.sub(fees);

        if(!isShort) {
            fees = swapTokens(token, BASE_TOKEN_ADDRESS, fees); // convert fees to base token
        }

        //pay apeswap amm fees
        IERC20(BASE_TOKEN_ADDRESS).safeTransfer(apeswapAmmFeesAddress, fees);

        transferUserToEscrow(owner, owner, commitmentWithLb);

        positionNonce = positionNonce + 1; //possible overflow is ok
        bytes32 positionId = getPositionId(
            owner,
            token,
            values[0],
            values[1],
            positionNonce
        );

        Position memory position = Position({
            owed: values[0],
            input: swap,
            commitment: commitmentWithLb,
            token: token,
            isShort: isShort,
            startTimestamp: uint32(block.timestamp),
            owner: owner,
            borrowInterest: borrowInterestPercentScaled,
            takeProfitPercent: uint32(values[3]),
            stopLossPercent: uint32(values[4])
        });

        positionInfo[positionId] = position;
        emit OnOpenPosition(owner, positionId, isShort, token, values[1], values[0], swap, position.takeProfitPercent,
            position.stopLossPercent);
        if(position.takeProfitPercent > 0) {
            emit OnTakeProfit(positionId, swap, position.takeProfitPercent, token, isShort);
        }
        if(position.stopLossPercent > 0) {
            emit OnStopLoss(positionId, swap, position.stopLossPercent, token, isShort);
        }
        return positionId;
    }

    /**
    * @dev add additional commitment to an opened position. The amount
    * must be initially approved
    * @param positionId id of the position to add commitment
    * @param amount the amount to add to commitment
    */
    function addCommitmentToPosition(bytes32 positionId, uint256 amount) public {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        position.commitment = position.commitment.add(amount);
        BASE_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        escrow[position.owner] = escrow[position.owner].add(amount);
        emit OnAddCommitment(positionId, amount);
    }

    /**
    * @dev allows anyone to close position if it's loss exceeds threshold
    */
    function setStopLoss(bytes32 positionId, uint32 percentAmount) public {
        require(percentAmount < 1e6, "STOPLOSS EXCEEDS MAX");
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        require(msg.sender == position.owner, "NOT_OWNER");
        position.stopLossPercent = percentAmount;
        emit OnStopLoss(positionId, position.input, percentAmount, position.token, position.isShort);
    }

    /**
    * @dev allows anyone to close position if it's profit exceeds threshold
    */
    function setTakeProfit(bytes32 positionId, uint32 percentAmount) public {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        require(msg.sender == position.owner, "NOT_OWNER");
        position.takeProfitPercent = percentAmount;
        emit OnTakeProfit(positionId, position.input, percentAmount, position.token, position.isShort);
    }

    function autoClose(bytes32 positionId) public isHuman {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);

        //check constraints
        (address baseToken, address quoteToken) = position.isShort ? (BASE_TOKEN_ADDRESS, position.token) : (position.token, BASE_TOKEN_ADDRESS);
        uint256 swapAmount = swapPathCreator.calculateConvertedValue(baseToken, quoteToken, position.input);
        uint256 hundredPercent = 1e6;
        require((position.takeProfitPercent != 0 && position.owed.mul(hundredPercent.add(position.takeProfitPercent)).div(hundredPercent) <= swapAmount) ||
            (position.stopLossPercent != 0 && position.owed.mul(hundredPercent.sub(position.stopLossPercent)).div(hundredPercent) >= swapAmount), "SL_OR_TP_UNAVAILABLE");

        //withdraw bonus from position commitment
        uint256 closeBonus = calculateAutoCloseBonus();
        require(position.commitment > closeBonus, "INSUFFICIENT COMMITMENT");
        position.commitment = position.commitment.sub(closeBonus);
        BASE_TOKEN.safeTransfer(msg.sender, closeBonus);
        transferEscrowToUser(position.owner, address(0), closeBonus);
        _closePosition(positionId, position, 0);
    }

    function calculateAutoOpenBonus() public view returns(uint256) {
        return thresholdGasPrice.mul(510000);
    }

    function calculateAutoCloseBonus() public view returns(uint256) {
        return thresholdGasPrice.mul(270000);
    }

    /**
    * @dev opens position that can be opened at a specific price
    */
    function openLimitOrder(address token, bool isShort, uint256 amount, uint256 minimalSwapAmount,
            uint256 leverageScaled, uint32 validBefore, uint32 takeProfitPercent, uint32 stopLossPercent) public  {
        require(!paused, "PAUSED");
        require(stopLossPercent < 1e6, "STOPLOSS EXCEEDS MAX");
        require(validBefore > block.timestamp, "INCORRECT_EXP_DATE");
        uint256[3] memory values256 = [amount, minimalSwapAmount, leverageScaled];
        uint32[3] memory values32 = [validBefore, takeProfitPercent, stopLossPercent];
        _openLimitOrder(token, isShort, values256, values32);
    }

    /**
    * @dev values256[0] - amount
    *      values256[1] - minimal swap amount
    *      values256[2] - scaled leverage
    *      values32[0] - valid before
    *      values32[1] - take profit percent
    *      values32[2] - stop loss percent
    */
    function _openLimitOrder(address token, bool isShort, uint256[3] memory values256, uint32[3] memory values) private {
        uint256 escrowAmount; //stack depth optimization
        {
            uint256 commitment = isShort ? getCommitment(values256[1], values256[2]) : getCommitment(values256[0], values256[2]);
            escrowAmount = commitment.add(calculateAutoOpenBonus()).add(calculateAutoCloseBonus());
            require(balanceOf[msg.sender] >= escrowAmount, "INSUFFICIENT_BALANCE");
            transferUserToEscrow(msg.sender, msg.sender, escrowAmount);
        }

        bytes32 limitOrderId = _getLimitOrderId(token, values256[0], values256[1], values256[2],
            values[0], msg.sender, isShort);
        Limit memory limitOrder = Limit({
            token: token,
            amount: values256[0],
            minimalSwapAmount: values256[1],
            leverageScaled: uint32(values256[2].div(1e14)),
            validBefore: values[0],
            owner: msg.sender,
            escrowAmount: escrowAmount,
            isShort: isShort,
            takeProfitPercent: values[1],
            stopLossPercent: values[2]
        });
        limitOrders[limitOrderId] = limitOrder;
        emitLimitOrderEvent(limitOrderId, token, values256, values, escrowAmount, isShort);
    }

    function emitLimitOrderEvent(bytes32 limitOrderId, address token, uint256[3] memory values256,
        uint32[3] memory values, uint256 escrowAmount, bool isShort) private  {
        emit OnLimitOrder(limitOrderId, msg.sender, token, values256[0], values256[1], values256[2], values[0], escrowAmount,
            values[1], values[2], isShort);
    }

    function cancelLimitOrder(bytes32 limitOrderId) public {
        Limit storage limitOrder = limitOrders[limitOrderId];
        require(limitOrder.owner == msg.sender, "NOT_OWNER");
        transferEscrowToUser(limitOrder.owner, limitOrder.owner, limitOrder.escrowAmount);
        delete limitOrders[limitOrderId];
        emit OnLimitOrderCancelled(limitOrderId);
    }

    function autoOpen(bytes32 limitOrderId) public isHuman {
        //get limit order
        Limit storage limitOrder = limitOrders[limitOrderId];
        require(limitOrder.owner != address(0), "NO_ORDER");
        require(limitOrder.validBefore >= uint32(block.timestamp), "EXPIRED");

        //check open rate
        (address baseToken, address quoteToken) = limitOrder.isShort ? (limitOrder.token, BASE_TOKEN_ADDRESS) : (BASE_TOKEN_ADDRESS, limitOrder.token);
        uint256 swapAmount = swapPathCreator.calculateConvertedValue(baseToken, quoteToken, limitOrder.amount);
        require(swapAmount >= limitOrder.minimalSwapAmount, "LIMIT NOT SATISFIED");

        uint256 openBonus = calculateAutoOpenBonus();
        //transfer bonus from escrow to caller
        BASE_TOKEN.transfer(msg.sender, openBonus);

        require(limitOrder.escrowAmount > openBonus, "INSUFFICIENT LO ESCROW AMOUNT");
        transferEscrowToUser(limitOrder.owner, limitOrder.owner, limitOrder.escrowAmount.sub(openBonus));
        transferEscrowToUser(limitOrder.owner, address(0), openBonus);

        //open position for user
        uint256[5] memory values = [limitOrder.amount, uint256(limitOrder.leverageScaled.mul(1e14)),
            limitOrder.minimalSwapAmount, uint256(limitOrder.takeProfitPercent), uint256(limitOrder.stopLossPercent)];

        bytes32 positionId = _openPosition(limitOrder.owner, limitOrder.token, limitOrder.isShort, values);

        //delete order id
        delete limitOrders[limitOrderId];
        emit OnLimitOrderCompleted(limitOrderId, positionId);
    }


    function _checkPositionIsOpen(Position storage position) private view {
        require(position.owner != address(0), "NO OPEN POSITION");
    }

    function addToPosition(bytes32 positionId, uint256 amount, uint256 minimumSwapAmount) external isHuman {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);

        address token = position.token;
        address baseTokenAddress = BASE_TOKEN_ADDRESS;
        bool isShort = position.isShort;
        //borrow tokens
        address pool = unimex_factory.getPool(address(isShort ? IERC20(token) : BASE_TOKEN));
        IUniMexPool(pool).borrow(amount);
        position.owed += amount;

        //swap tokens
        uint256 swap;
        (address baseToken, address quoteToken) = isShort ? (token, baseTokenAddress) : (baseTokenAddress, token);
        swap = swapTokens(baseToken, quoteToken, amount);
        require(swap >= minimumSwapAmount, "INSUFFICIENT SWAP");

        //pay fees
        uint256 fees = (swap.mul(2)).div(1000);
        swap = swap.sub(fees);

        IERC20(baseTokenAddress).safeTransfer(apeswapAmmFeesAddress, fees);

        //update position values
        position.owed += amount;
        position.input += swap;

        //check no liquidation
        require(!canLiquidate(positionId), "INSUFFICIENT COMMITMENT");
    }

    function removeFromPosition(bytes32 positionId, uint256 amount, uint256 minSwapAmount) external isHuman {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        require(amount < position.owed, "WRONG AMOUNT");

        address token = position.token;
        address pool = unimex_factory.getPool(address(position.isShort ? IERC20(token) : BASE_TOKEN));
        uint256 poolInterestInTokens = calculateBorrowInterest(amount, position.startTimestamp, position.borrowInterest);
        uint256 fees;

        (address baseToken, address quoteToken) = position.isShort ? (token, BASE_TOKEN_ADDRESS) : (BASE_TOKEN_ADDRESS, token);

        //convert commitment to owed tokens
        uint256 swap = swapTokens(quoteToken, baseToken, amount);
        require(swap >= minSwapAmount, "INSUFFICIENT SWAP");

        //pay back owed tokens
        transferToPool(pool, baseToken, swap.sub(poolInterestInTokens));

        if(position.isShort) {
            //pay fees
            fees = poolInterestInTokens > 0 ? swapPathCreator.calculateConvertedValue(position.token, 
                                                                    address(BASE_TOKEN), poolInterestInTokens) : 0;
        } else {
            fees = poolInterestInTokens;
        }
        //pay fees
        transferFees(poolInterestInTokens, pool);
        //update position values
        position.owed -= swap;
        position.input -= amount;

        //check no liquidation
        require(!canLiquidate(positionId), "INSUFFICIENT COMMITMENT");
    }

    function closePosition(bytes32 positionId, uint256 minimalSwapAmount) external isHuman {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        require(msg.sender == position.owner, "BORROWER ONLY");
        _closePosition(positionId, position, minimalSwapAmount);
    }

    function _closePosition(bytes32 positionId, Position storage position, uint256 minimalSwapAmount) private nonReentrant{
        uint256 scaledRate;
        if(position.isShort) {
            scaledRate = _closeShort(position, minimalSwapAmount);
        }else{
            scaledRate = _closeLong(position, minimalSwapAmount);
        }
        deletePosition(positionId, position, 0, scaledRate);
    }

    function _closeShort(Position storage position, uint256 minimalSwapAmount) private returns (uint256){
        uint256 input = position.input;
        uint256 owed = position.owed;
        uint256 commitment = position.commitment;

        address pool = unimex_factory.getPool(position.token);

        uint256 poolInterestInTokens = calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        uint256 swap = swapTokens(BASE_TOKEN_ADDRESS, position.token, input);
        require(swap >= minimalSwapAmount, "INSUFFICIENT SWAP");
        uint256 scaledRate = calculateScaledRate(input, swap);
        require(swap >= owed.add(poolInterestInTokens).mul(input).div(input.add(commitment)), "LIQUIDATE ONLY");

        bool isProfit = owed < swap;
        uint256 amount;

        if(isProfit) {
            uint256 profitInTokens = swap.sub(owed);
            uint256 profitFees = profitInTokens.mul(25).div(1000);
            transferProjectFees(position.token, profitFees);
            amount = swapTokens(position.token, BASE_TOKEN_ADDRESS, profitInTokens.sub(profitFees)); //profit in base token
        } else {
            uint256 commitmentInTokens = swapTokens(BASE_TOKEN_ADDRESS, position.token, commitment);
            uint256 remainder = owed.sub(swap);
            require(commitmentInTokens >= remainder, "LIQUIDATE ONLY");
            amount = swapTokens(position.token, BASE_TOKEN_ADDRESS, commitmentInTokens.sub(remainder)); //return to user's balance
        }
        uint256 fees = poolInterestInTokens > 0 ? swapPathCreator.calculateConvertedValue(position.token, 
                                                                    address(BASE_TOKEN), poolInterestInTokens) : 0;
        if(isProfit) {
            if(amount >= fees) {
                transferEscrowToUser(position.owner, position.owner, commitment);
                transferToUser(position.owner, amount.sub(fees));
            } else {
                uint256 remainder = fees.sub(amount);
                transferEscrowToUser(position.owner, position.owner, commitment.sub(remainder));
                transferEscrowToUser(position.owner, address(0), remainder);
            }
        } else {
            require(amount >= fees, "LIQUIDATE_ONLY"); //safety check
            transferEscrowToUser(position.owner, address(0x0), commitment);
            transferToUser(position.owner, amount.sub(fees));
        }
        transferFees(fees, pool);

        transferToPool(pool, position.token, owed);

        return scaledRate;
    }

    function _closeLong(Position storage position, uint256 minimalSwapAmount) private returns (uint256){
        uint256 input = position.input;
        uint256 owed = position.owed;
        address pool = unimex_factory.getPool(BASE_TOKEN_ADDRESS);

        uint256 fees = calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        uint256 swap = swapTokens(position.token, BASE_TOKEN_ADDRESS, input);
        require(swap >= minimalSwapAmount, "INSUFFICIENT SWAP");
        uint256 scaledRate = calculateScaledRate(swap, input);
        require(swap.add(position.commitment) >= owed.add(fees), "LIQUIDATE ONLY");

        uint256 commitment = position.commitment;

        bool isProfit = swap >= owed;
        if(isProfit) {
            uint256 amount = swap.sub(owed);
            transferToPool(pool, BASE_TOKEN_ADDRESS, owed);
            uint256 profitFees = amount.mul(25).div(1000);
            if(fees.add(profitFees) <= amount) {
                transferEscrowToUser(position.owner, position.owner, commitment);
                transferToUser(position.owner, amount.sub(fees).sub(profitFees));
            } else {
                uint256 remainder = fees.add(profitFees).sub(amount);
                transferEscrowToUser(position.owner, position.owner, commitment.sub(remainder)); 
                transferEscrowToUser(position.owner, address(0x0), remainder); // take lacking tokens from escrow
            }
            transferProjectFees(BASE_TOKEN_ADDRESS, profitFees);
        } else {
            uint256 amount = commitment.sub(owed.sub(swap));
            transferToPool(pool, BASE_TOKEN_ADDRESS, owed);
            transferEscrowToUser(position.owner, address(0x0), commitment);
            transferToUser(position.owner, amount.sub(fees));
        }
        transferFees(fees, pool);

        return scaledRate;
    }


    /**
    * @dev helper function, indicates when a position can be liquidated.
    * Liquidation threshold is when position input plus commitment can be converted to 110% of owed tokens
    */
    function canLiquidate(bytes32 positionId) public view returns(bool) {
        Position storage position = positionInfo[positionId];
        uint256 liquidationBonus = calculateAutoCloseBonus();
        uint256 canReturn;
        if(position.isShort) {
            uint256 positionBalance = position.input.add(position.commitment);
            uint256 valueToConvert = positionBalance < liquidationBonus ? 0 : positionBalance.sub(liquidationBonus);
            canReturn = swapPathCreator.calculateConvertedValue(BASE_TOKEN_ADDRESS, position.token, valueToConvert);
        } else {
            uint256 canReturnOverall = swapPathCreator.calculateConvertedValue(position.token, BASE_TOKEN_ADDRESS, position.input)
                    .add(position.commitment);
            canReturn = canReturnOverall < liquidationBonus ? 0 : canReturnOverall.sub(liquidationBonus);
        }
        uint256 poolInterest = calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        return canReturn < position.owed.add(poolInterest).mul(LIQUIDATION_MARGIN).div(MAG);
    }

    /**
    * @dev Liquidates position and sends a liquidation bonus from user's commitment to a caller.
    */
    function liquidatePosition(bytes32 positionId, uint256 minimalSwapAmount) external isHuman nonReentrant {
        Position storage position = positionInfo[positionId];
        _checkPositionIsOpen(position);
        uint256 canReturn;
        uint256 poolInterest = calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);

        uint256 liquidationBonus = calculateAutoCloseBonus();
        uint256 liquidatorBonus;
        uint256 scaledRate;
        if(position.isShort) {
            uint256 positionBalance = position.input.add(position.commitment);
            uint256 valueToConvert;
            (valueToConvert, liquidatorBonus) = _safeSubtract(positionBalance, liquidationBonus);
            canReturn = swapTokens(BASE_TOKEN_ADDRESS, position.token, valueToConvert);
            require(canReturn >= minimalSwapAmount, "INSUFFICIENT_SWAP");
            scaledRate = calculateScaledRate(valueToConvert, canReturn);
        } else {
            uint256 swap = swapTokens(position.token, BASE_TOKEN_ADDRESS, position.input);
            require(swap >= minimalSwapAmount, "INSUFFICIENT_SWAP");
            scaledRate = calculateScaledRate(swap, position.input);
            uint256 canReturnOverall = swap.add(position.commitment);
            (canReturn, liquidatorBonus) = _safeSubtract(canReturnOverall, liquidationBonus);
        }
        require(canReturn < position.owed.add(poolInterest).mul(LIQUIDATION_MARGIN).div(MAG), "CANNOT_LIQUIDATE");

        _liquidate(position, canReturn, poolInterest);

        transferEscrowToUser(position.owner, address(0x0), position.commitment);
        BASE_TOKEN.safeTransfer(msg.sender, liquidatorBonus);

        deletePosition(positionId, position, liquidatorBonus, scaledRate);
    }

    function _liquidate(Position memory position, uint256 canReturn, uint256 fees) private {
        address baseToken = position.isShort ? position.token : BASE_TOKEN_ADDRESS;
        address pool = unimex_factory.getPool(baseToken);
        if(canReturn > position.owed) {
            transferToPool(pool, baseToken, position.owed);
            uint256 remainder = canReturn.sub(position.owed);
            if(remainder > fees) { //can pay fees completely
                if(position.isShort) {
                    remainder = swapTokens(position.token, BASE_TOKEN_ADDRESS, remainder);
                    if(fees > 0) { //with fees == 0 calculation is reverted with "UV2: insufficient input amount"
                        fees = swapPathCreator.calculateConvertedValue(position.token, BASE_TOKEN_ADDRESS, fees);
                        if(fees > remainder) { //safety check
                            fees = remainder;
                        }
                    }
                }
                transferFees(fees, pool);
                transferToUser(position.owner, remainder.sub(fees));
            } else { //all is left is for fees
                if(position.isShort) {
                    //convert remainder to busd
                    remainder = swapTokens(position.token, BASE_TOKEN_ADDRESS, canReturn.sub(position.owed));
                }
                transferFees(remainder, pool);
            }
        } else {
            //return to pool all that's left
            uint256 correction = position.owed.sub(canReturn);
            IUniMexPool(pool).distributeCorrection(correction);
            transferToPool(pool, baseToken, canReturn);
        }
    }

    function setStaking(address _staking) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        require(_staking != address(0));
        staking = IUniMexStaking(_staking);
    }

    /**
    * @dev called by the owner to pause, triggers stopped state
    */
    function pause() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        paused = true;
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    function unpause() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        paused = false;
    }

    function setThresholdGasPrice(uint256 gasPrice) external {
        require(hasRole(LIQUIDATOR_ROLE, msg.sender), "NOT LIQUIDATOR");
        require(gasPrice <= 750000e9, "GAS PRICE EXCEEDS MAX"); //in busd, equal to 1500 gwei with bnb/usd = 500 rate
        thresholdGasPrice = gasPrice;
    }

    /**
    * @dev set interest rate for tokens owed from pools. Scaled to 10 (e.g. 150 is 15%)
    */
    function setBorrowPercent(uint32 _newPercentScaled) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        require(borrowInterestPercentScaled <= 1000, "INTEREST EXCEEDS MAX");
        borrowInterestPercentScaled = _newPercentScaled;
    }

    function calculateScaledRate(uint256 busdAmount, uint256 tokenAmount) private pure returns (uint256 scaledRate) {
        if(tokenAmount == 0) {
            return 0;
        }
        return busdAmount.mul(MAG).div(tokenAmount);
    }

    function transferUserToEscrow(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount);
        balanceOf[from] = balanceOf[from].sub(amount);
        escrow[to] = escrow[to].add(amount);
    }

    function transferEscrowToUser(address from, address to, uint256 amount) private {
        require(escrow[from] >= amount);
        escrow[from] = escrow[from].sub(amount);
        balanceOf[to] = balanceOf[to].add(amount);
    }

    function transferToUser(address to, uint256 amount) private {
        balanceOf[to] = balanceOf[to].add(amount);
    }

    function getPositionId(
        address maker,
        address token,
        uint256 amount,
        uint256 leverage,
        uint256 nonce
    ) private pure returns (bytes32 positionId) {
        //date acts as a nonce
        positionId = keccak256(
            abi.encodePacked(maker, token, amount, leverage, nonce)
        );
    }

    function swapTokens(address baseToken, address quoteToken, uint256 input) private returns (uint256 swap) {
        if(input == 0) {
            return 0;
        }
        IERC20(baseToken).approve(address(uniswap_router), input);
        address[] memory path = swapPathCreator.getPath(baseToken, quoteToken);
        uint256 balanceBefore = IERC20(quoteToken).balanceOf(address(this));

        IUniswapV2Router02(uniswap_router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            input,
            0, //checks are done after swap in caller functions
            path,
            address(this),
            block.timestamp
        );

        uint256 balanceAfter = IERC20(quoteToken).balanceOf(address(this));
        swap = balanceAfter.sub(balanceBefore);
    }

    /**
    * @dev Transfers fees to pool and stakers. 
    * As fees are taken in BASE token, we need to convert them to ETH as pools accept ETH fees
    */
    function transferFees(uint256 baseTokenFees, address pool) private {
        uint256 fees = swapTokens(BASE_TOKEN_ADDRESS, WETH_ADDRESS, baseTokenFees); // convert fees to ETH
        uint256 halfFees = fees.div(2);

        // Pool fees
        IERC20(WETH_ADDRESS).approve(pool, halfFees);
        IUniMexPool(pool).distribute(halfFees);

        // Staking Fees
        IERC20(WETH_ADDRESS).approve(address(staking), fees.sub(halfFees));
        staking.distribute(fees.sub(halfFees));
    }

    function transferProjectFees(address token, uint256 amount) private {
        IERC20(token).safeTransfer(projectFeesAddress, amount);
    } 

    function transferToPool(address pool, address token, uint256 amount) private {
        IERC20(token).approve(pool, amount);
        IUniMexPool(pool).repay(amount);
    }

    function setAmountThresholds(uint32 leverage5) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        amountThresholds = leverage5;
    }

    function deletePosition(bytes32 positionId, Position storage position, uint256 liquidatedAmount, uint256 scaledRate) private {
        emit OnClosePosition(
            positionId,
            position.token,
            position.owner,
            position.owed,
            position.input,
            position.commitment,
            position.startTimestamp,
            position.isShort,
            position.borrowInterest,
            liquidatedAmount,
            scaledRate
        );
        delete positionInfo[positionId];
    }

    function setSwapPathCreator(address newAddress) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        require(newAddress != address(0), "ZERO ADDRESS");
        swapPathCreator = ISwapPathCreator(newAddress);
    }

    // function updateUniswapRouter(address newAddress) external {
    //     require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
    //     require(newAddress != address(0), "ZERO ADDRESS");
    //     uniswap_router = IUniswapV2Router02(newAddress);
    // }

    // function updateUniswapFactory(address newAddress) external {
    //     require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
    //     require(newAddress != address(0), "ZERO ADDRESS");
    //     uniswap_factory = IUniswapV2Factory(newAddress);
    // }

    function setFeesAddresses(address _apeswapAmmFeessAddress, address _projectFeesAddress) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ONLY ADMIN");
        require(_apeswapAmmFeessAddress != address(0), "ZERO ADDRESS");
        require(_projectFeesAddress != address(0), "ZERO ADDRESS");
        apeswapAmmFeesAddress = _apeswapAmmFeessAddress; 
        projectFeesAddress = _projectFeesAddress;
    }

    function getCommitment(uint256 _amount, uint256 scaledLeverage) internal pure returns (uint256 commitment) {
        commitment = (_amount.mul(1e18)).div(scaledLeverage);
    }

    function calculateBorrowInterest(uint256 amount, uint256 from, uint256 borrowInterest) public view returns (uint256) {
        uint256 loanTime = block.timestamp.sub(from);
        return amount.mul(loanTime).mul(borrowInterest).div(1000).div(YEAR);
    }

    function _getLimitOrderId(address token, uint256 amount, uint256 minSwapAmount,
            uint256 scaledLeverage, uint256 validBefore, address owner, bool isShort) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(token, amount, minSwapAmount, scaledLeverage, validBefore,
            owner, isShort));
    }

    function _safeSubtract(uint256 from, uint256 amount) internal pure returns (uint256 remainder, uint256 subtractedAmount) {
        if(from < amount) {
            remainder = 0;
            subtractedAmount = from;
        } else {
            remainder = from.sub(amount);
            subtractedAmount = amount;
        }
    }

}
