// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract UniMex is ERC20("https://unimex.network/", "UMX"), Ownable {
 
    mapping(address => bool) public whitelist;
    bool public locked;
    
    constructor() public {
        locked = true;
    }

    function unlock() public onlyOwner {
        locked = false;
    } 

    function lock() public onlyOwner {
        locked = true;
    }

    function addToWhitelist(address _user) public onlyOwner {
        whitelist[_user] = true;
    }

    function removeFromWhitelist(address _user) public onlyOwner {
        whitelist[_user] = false;
    }
    
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        if(locked) {
            require(msg.sender == owner() || whitelist[msg.sender]);
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if(locked) {
            require(from == owner() || whitelist[from]);
        }
        return super.transferFrom(from, to, amount);
    }

}