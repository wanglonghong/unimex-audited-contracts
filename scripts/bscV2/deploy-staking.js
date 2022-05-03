const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const projectDivsDistributor = '0x19697604D773d3cc51D1a7fAFe592c1b35472CDB';
    const dexRouterAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
    const divsTokenAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; //WBNB
    const stakingToken = '0x72f28c09be1342447fa01Ebc76eF508473d08c5c';

    const Staking = await ethers.getContractFactory('UniMexStaking');
    const staking = await Staking.deploy(dexRouterAddress, divsTokenAddress, projectDivsDistributor);
    console.log(`staking deployed to ${staking.address}`)
    console.log(`npx hardhat verify ${staking.address} ${dexRouterAddress} ${divsTokenAddress} ${projectDivsDistributor} --network ${network}`)
    await staking.setToken(stakingToken);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })