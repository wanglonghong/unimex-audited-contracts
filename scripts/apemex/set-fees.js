const { ethers } = require("hardhat");
const { deployAndVerify } = require('../utils/deployer');
const { attach } = require("../utils/utils");

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

	const distributor = await attach("StakingFeesDistributorProxy", '0xD0a9bB1995A163b7d554AdCc3c35d35782E16C65')
	await distributor.setDistribution([
		'0x26589B220030C7dB8472Cf9A19a2CAA2186eec91', // was set to a wrong address? '0x5d76677bd3f60be39d6dcad1cb3fbffc4256271c',
		'0xE61B81334dC34c34345B6967c82479d7c27Af283', //team fees
		'0xf2DE1128f3e12fd3cD8D6c19538e2C952DBDc2c8', //space x
		'0xC22C065c6AD58d41CC6505ff01569384bDAbC5B2' //another space x contract
	], [
		3333,
		3333,
		1667,
		1667
	])
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })