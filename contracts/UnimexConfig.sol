// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import './interfaces/IUniMexFactory.sol';


contract UnimexConfig is Ownable {

    mapping(address => uint256) leverages;
    IUniMexFactory immutable factory;

    event LeverageUpdated(address indexed token, uint256 leverage);

    constructor(address _unimexFactory) public {
        factory = IUniMexFactory(_unimexFactory);
    }

    function getMaxLeverage(address token) public view returns (uint256) {
        if(leverages[token] > 0) {
            return leverages[token];
        } else {
            return factory.getMaxLeverage(token);
        }
    }

    function setMaxLeverage(address token, uint256 maxLeverage) public onlyOwner {
        leverages[token] = maxLeverage;
        emit LeverageUpdated(token, maxLeverage);
    }

}