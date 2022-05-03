const { ethers } = require("hardhat");

const network = 'mainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

    const stakingAddress = '0x8dC85B6056b40c950e6119899Cac90BE9EEb4da7'
    const factoryAddress = '0xC80B0efB594df8bE90A643C7F7a462541Cd7F6eE'
    const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
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