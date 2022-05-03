// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

interface IUniMexFactory {
  function getPool(address) external view returns(address);
  function getMaxLeverage(address) external view returns(uint256);
  function allowedMargins(address) external view returns (bool);
  function utilizationScaled(address token) external view returns(uint256);
}