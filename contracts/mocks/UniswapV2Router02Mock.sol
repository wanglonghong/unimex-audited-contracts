// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


import "../Uniswap.sol";

import "hardhat/console.sol";


contract UniswapV2Router02Mock {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public factory;
    address public WETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'UniswapV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    event OnDebug(
        string message,
        uint256 value
    );

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint /* amountOutMin */,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) {
        IERC20 from = IERC20(path[0]);
        IERC20 toToken = IERC20(path[path.length - 1]);
        from.safeTransferFrom(msg.sender, address(this), amountIn);

        address token0;
        address token1;
        (token0, token1) = UniswapV2Library.sortTokens(path[0], path[path.length - 1]);
        IUniswapV2Pair pair = IUniswapV2Pair(IUniswapV2Factory(factory).getPair(token0, token1));
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        uint256 value;
        if (token1 == path[0]) {
            value = UniswapV2Library.getAmountOut(amountIn, reserve1, reserve0);
        } else {
            value = UniswapV2Library.getAmountOut(amountIn, reserve0, reserve1);
        }

        toToken.transfer(to, value);
    }

}