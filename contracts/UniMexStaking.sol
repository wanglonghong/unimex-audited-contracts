// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Uniswap.sol";

contract UniMexStaking is Ownable {
    using SignedSafeMath for int256;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 private constant FLOAT_SCALAR = 2**64;

    uint256 public constant PERCENT_FACTOR = 1e3;
    uint256 public projectsPercent = 875; //87.5%
    address public projectsDivsDistributorAddress;
    uint256 public projectsBalance;

    uint256 public pendingDivs;

    address public uniswapRouter;

    struct User {
        uint256 balance;
        int256 scaledPayout;
    }

    IERC20 public token;
    IERC20 public WETH;
    uint256 public divPerShare;

    mapping(address => User) public users;

    event OnDeposit(address indexed from, uint256 amount);
    event OnWithdraw(address indexed from, uint256 amount);
    event OnClaim(address indexed from, uint256 amount);
    event OnTransfer(address indexed from, address indexed to, uint256 amount);
    
    constructor(address _uniswapRouter, address _weth, address _projectsAddress) public {
        require(_uniswapRouter != address(0) && _weth != address(0) && _projectsAddress != address(0), "ZERO_ADDRESS");
        WETH = IERC20(_weth);
        uniswapRouter = _uniswapRouter;
        projectsDivsDistributorAddress = _projectsAddress;
    }

    function setToken(address _token) external onlyOwner {
        require(address(token) == address(0));
        token = IERC20(_token);
    }

    function totalSupply() private view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function setProjectsDivsDistributorAddress(address _newAddr) public onlyOwner {
        require(_newAddr != address(0));
        projectsDivsDistributorAddress = _newAddr;
    }

    function setProjectsDivsPercent(uint256 percentScaled) public onlyOwner{
        require(percentScaled < PERCENT_FACTOR, "percent exceeds max");
        projectsPercent = percentScaled;
    }

    //@dev deposit dust token upon deployment to prevent division by zero 
    function distribute(uint256 _amount) external returns(bool) {
        WETH.safeTransferFrom(address(msg.sender), address(this), _amount);
        pendingDivs = pendingDivs.add(_amount); //lazy divs distribution for gas savings on trades
        return true;
    }

    function updatePendingDivs() public {
        if(pendingDivs > 0) {
            uint256 projectsPart = pendingDivs.mul(projectsPercent).div(PERCENT_FACTOR);
            projectsBalance = projectsBalance.add(projectsPart);

            uint256 stakersPart = pendingDivs.sub(projectsPart);
            divPerShare = divPerShare.add((stakersPart.mul(FLOAT_SCALAR)).div(totalSupply()));
            pendingDivs = 0;
        }
    }

    function distributeDivs() external returns(bool) {
        updatePendingDivs();
        uint256 projectsBalanceCopy = projectsBalance;
        projectsBalance = 0;

        WETH.safeTransfer(projectsDivsDistributorAddress, projectsBalanceCopy);
        return true;
    }

    function deposit(uint256 _amount) external {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        depositFrom(_amount);
    }
    
    function depositFrom(uint256 _amount) private {
        updatePendingDivs();
        users[msg.sender].balance = users[msg.sender].balance.add(_amount);
        users[msg.sender].scaledPayout = users[msg.sender].scaledPayout.add(
            int256(_amount.mul(divPerShare))
        );
        emit OnDeposit(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external {
        updatePendingDivs();
        require(balanceOf(msg.sender) >= _amount);
        users[msg.sender].balance = users[msg.sender].balance.sub(_amount);
        users[msg.sender].scaledPayout = users[msg.sender].scaledPayout.sub(
            int256(_amount.mul(divPerShare))
        );
        token.safeTransfer(msg.sender, _amount);
        emit OnWithdraw(msg.sender, _amount);
    }

    function claim() external {
        updatePendingDivs();
        uint256 _dividends = dividendsOf(msg.sender);
        require(_dividends > 0);
        users[msg.sender].scaledPayout = users[msg.sender].scaledPayout.add(
            int256(_dividends.mul(FLOAT_SCALAR))
        );
        WETH.safeTransfer(address(msg.sender), _dividends);
        emit OnClaim(msg.sender, _dividends);
    }

    function reinvestWithMinimalAmountOut(uint256 delay, uint256 minimalAmountOut) public {
        updatePendingDivs();
        uint256 dividends = dividendsOf(msg.sender);
        require(dividends > 0);
        users[msg.sender].scaledPayout = users[msg.sender].scaledPayout.add(
            int256(dividends.mul(FLOAT_SCALAR))
        );
        WETH.approve(address(uniswapRouter), dividends);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        address[] memory path = new address[](2);
        path[0] = address(WETH);
        path[1] = address(token);

        IUniswapV2Router02(uniswapRouter)
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                dividends,
                minimalAmountOut,
                path,
                address(this),
                block.timestamp.add(delay)
            );
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint convertedTokens = balanceAfter.sub(balanceBefore);
        require(convertedTokens > 0, "ZERO_CONVERT");
        depositFrom(convertedTokens);
    }

    function reinvest(uint256 delay) external {
        reinvestWithMinimalAmountOut(delay, 0);
    }

    function transfer(address _to, uint256 _amount) external returns (bool) {
        return _transfer(msg.sender, _to, _amount);
    }

    function balanceOf(address _user) public view returns (uint256) {
        return users[_user].balance;
    }

    function dividendsOf(address _user) public view returns (uint256) {
        return
            uint256(
                int256(divPerShare.mul(balanceOf(_user))).sub(
                    users[_user].scaledPayout
                )
            )
                .div(FLOAT_SCALAR);
    }

    function _transfer(
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (bool) {
        require(users[_from].balance >= _amount);
        users[_from].balance = users[_from].balance.sub(_amount);
        users[_from].scaledPayout = users[_from].scaledPayout.sub(
            int256(_amount.mul(divPerShare))
        );
        users[_to].balance = users[_to].balance.add(_amount);
        users[_to].scaledPayout = users[_to].scaledPayout.add(
            int256(_amount.mul(divPerShare))
        );
        emit OnTransfer(msg.sender, _to, _amount);
        return true;
    }

    function updateRouterAddress(address newAddress) external onlyOwner {
        require(newAddress != address(0), "zero address");
        uniswapRouter = newAddress;
    }

}
