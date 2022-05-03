// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import '../Uniswap.sol';
import '../UniMexPool.sol';
import "../interfaces/ISwapPathCreator.sol";

contract SwapPathCreatorMock is ISwapPathCreator {

    address public uniswapFactory;
    constructor(address _uniswapFactory) public {
        require(_uniswapFactory != address(0), "ZERO ADDRESS");
        uniswapFactory = _uniswapFactory;
    }

    function getPath(address baseToken, address quoteToken) public override view returns(address[] memory) {
            address[] memory path = new address[](2);
            path[0] = baseToken;
            path[1] = quoteToken;
            return path;
    }

    function calculateConvertedValue(address baseToken, address quoteToken, uint256 amount) external override view returns (uint256) {
        address[] memory path = getPath(baseToken, quoteToken);
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(uniswapFactory, amount, path);
        return amounts[amounts.length - 1];
    }

}