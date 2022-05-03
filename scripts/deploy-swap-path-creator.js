const { ethers } = require("hardhat");

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

    // const factoryAddress = '0xBCfCcbde45cE874adCB698cC183deBcF17952812'; //bsc
    const factoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; //eth

    const SwapPathCreator = await ethers.getContractFactory('SwapPathCreator');

    const spc = await SwapPathCreator.deploy(factoryAddress)
    console.log(`swap path creator: ${spc.address}`)
    console.log(`npx hardhat verify ${spc.address} ${factoryAddress}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })