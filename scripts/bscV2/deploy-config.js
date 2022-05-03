const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const unimexFactory = '0x393b4d737c474fF681eFd0ec48c7dB73f5E4eBC5';

    const UnimexConfig = await ethers.getContractFactory('UnimexConfig');
    const config = await UnimexConfig.deploy(unimexFactory);
    console.log(`staking deployed to ${config.address}`)
    console.log(`npx hardhat verify ${config.address} ${unimexFactory} --network ${network}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })