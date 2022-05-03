/*

_____/\\\\\\\\\__________________________________/\\\\____________/\\\\______________________________        
 ___/\\\\\\\\\\\\\_______________________________\/\\\\\\________/\\\\\\______________________________       
  __/\\\/////////\\\___/\\\\\\\\\_________________\/\\\//\\\____/\\\//\\\______________________________      
   _\/\\\_______\/\\\__/\\\/////\\\_____/\\\\\\\\__\/\\\\///\\\/\\\/_\/\\\_____/\\\\\\\\___/\\\____/\\\_     
    _\/\\\\\\\\\\\\\\\_\/\\\\\\\\\\____/\\\/////\\\_\/\\\__\///\\\/___\/\\\___/\\\/////\\\_\///\\\/\\\/__    
     _\/\\\/////////\\\_\/\\\//////____/\\\\\\\\\\\__\/\\\____\///_____\/\\\__/\\\\\\\\\\\____\///\\\/____   
      _\/\\\_______\/\\\_\/\\\_________\//\\///////___\/\\\_____________\/\\\_\//\\///////______/\\\/\\\___  
       _\/\\\_______\/\\\_\/\\\__________\//\\\\\\\\\\_\/\\\_____________\/\\\__\//\\\\\\\\\\__/\\\/\///\\\_ 
        _\///________\///__\///____________\//////////__\///______________\///____\//////////__\///____\///__

Fees distribution proxy. Sends 40% of incoming fees to the staking contract and expects 15% from it back

*/

// SPDX-License-Identifier: UNLICENSE

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDistributor.sol";
import "./interfaces/IUniMexStaking.sol";
import "./ProjectDivsDistributor.sol";

contract StakingFeesDistributorProxy is ProjectDivsDistributor, IDistributor {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

	IUniMexStaking immutable public STAKING;

    constructor(IUniMexStaking _staking, address[] memory _addresses, uint256[] memory _percents) ProjectDivsDistributor(_addresses, _percents) public {
        setDistribution(_addresses, _percents);
		require(address(_staking) != address(0), "zero address");
		STAKING = _staking;
		IERC20(_staking.WETH()).approve(address(_staking), type(uint256).max);
    }
	
	function distribute(uint256 _amount) external override {
		//40% goes to staking, staking takes 62.5% of incoming fees, the rest sends back
		//so staking gets 25% of _amount
		IERC20(STAKING.WETH()).safeTransferFrom(msg.sender, address(this), _amount);
		STAKING.distribute(_amount.mul(4).div(10)); 
	}

	function distributeToken(IERC20 token) public override {
		if(address(token) == STAKING.WETH()) {
			STAKING.distributeDivs();
		}
		super.distributeToken(token);
	}

}