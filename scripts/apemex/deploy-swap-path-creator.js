const { ethers } = require("hardhat");
const { deployAndVerify } = require('../utils/deployer')

const network = 'mainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

	const apeswapFactory = '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6';
	const wbnbAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
	await deployAndVerify("SwapPathCreator", [apeswapFactory, wbnbAddress])
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })