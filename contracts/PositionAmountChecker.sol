// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPositionAmountChecker.sol";
import "./Uniswap.sol";

contract PositionAmountChecker is IPositionAmountChecker, Ownable {
    using SafeMath for uint256;

    uint32 public amountThresholds = 275;
    IUniswapV2Factory public uniswapFactory;

    constructor(address _uniswapFactory) public {
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    }

    function checkPositionAmount(address baseToken, address quoteToken, uint256 amount,
        uint256 leverageScaled) external override view returns (bool) {
        if(leverageScaled <= 1e18) {
            return true;
        }
        address token0;
        address token1;
        (token0, token1) = UniswapV2Library.sortTokens(baseToken, quoteToken);
        IUniswapV2Pair pair = IUniswapV2Pair(uniswapFactory.getPair(token0, token1));
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        uint256 tokenLiquidity = token0 == baseToken ? reserve0 : reserve1;
        if (leverageScaled <= 2e18) {
            return amount < tokenLiquidity.mul(amountThresholds).mul(1109).div(1000).div(1e4);
        }  else {
            return amount < tokenLiquidity.mul(amountThresholds).div(1e4);
        }

    }

    function setAmountThresholds(uint32 leverage5) public onlyOwner {
        amountThresholds = leverage5;
    }

}