const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;
const { deployAndVerify } = require('../utils/deployer')

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

	await deployAndVerify("ProjectDivsDistributor", [
		[
			'0x5BD7f705e6ECddaFa294E2409CeEc51103994AB8',
			'0x8E6F1558c1F172365B70e09217a4f97dd76f0D84',
			'0xF4bEc9d4e1cec8403B3fef406f2AA909053f8701',
			'0xA4e0dac2B0c82D27f21c157A860c336417845098',
			'0xd97C6f55Cd427Fa5394Fe26D46D5c94Dba5447e5',
			'0x21F2f28AE06c4C2dAac0aB743Ac0b09eFfEecB2F',
			'0xF3A3c294C783c8a825fDf7e77F0c90477b237B1C',
			'0xcD07aE01A4a8400DD3162dA49E0f3B8Fbb1e3D15',
		],
		[
			1667,
			1667,
			1667,
			833,
			833,
			833,
			1250,
			1250,
		]
	])



}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })