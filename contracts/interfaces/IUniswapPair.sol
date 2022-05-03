interface IUniswapV2Pair {

    function getReserves() external view returns (uint112 r0, uint112 r1, uint32 blockTimestampLast);

    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

}