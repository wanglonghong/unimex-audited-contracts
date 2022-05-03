// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

interface IUnimexConfig {

    function getMaxLeverage(address token) external view returns (uint256);

}