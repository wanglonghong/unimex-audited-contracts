const { ethers } = require("hardhat");

const network = 'rinkeby'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

    const stakingAddress = '0xd478389A2AA49677bbe5B7DeF351BC14eaD0DFb1'
    const factoryAddress = '0xd297E39FAC07bD99E269de5F56142933cBedd7E0'
    const wethAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    const uniswapFactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
    const uniswapRouterV2Address = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'

    const UniMexMargin = await ethers.getContractFactory('UniMexMargin')
    const margin = await UniMexMargin.deploy(stakingAddress, factoryAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address)
    console.log(`margin: ${margin.address}`)
    console.log(`npx hardhat verify ${margin.address} ${stakingAddress} ${factoryAddress} ${wethAddress} ${uniswapFactoryAddress} ${uniswapRouterV2Address} --network ${network}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })