// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

interface IUniMexStaking {
    
    function distribute(uint256 _amount) external;

    function WETH() external returns(address);

    function distributeDivs() external returns(bool);

}

