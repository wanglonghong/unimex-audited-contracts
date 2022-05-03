const { ethers } = require("hardhat");

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

    const stakingAddress = '0x8dc85b6056b40c950e6119899cac90be9eeb4da7'
    const factoryAddress = '0xc80b0efb594df8be90a643c7f7a462541cd7f6ee'
    const busdAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const uniswapFactoryAddress = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'
    const uniswapRouterV2Address = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
    const swapPathCreatorAddress = '0xB93B4db62072C78629f5CB44ABb6E4C04DA59457'

    const UniMexMargin = await ethers.getContractFactory('UniMexMargin')
    const margin = await UniMexMargin.deploy(stakingAddress, factoryAddress, busdAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address, swapPathCreatorAddress)
    console.log(`margin: ${margin.address}`)
    console.log(`npx hardhat verify ${margin.address} ${stakingAddress} ${factoryAddress} ${busdAddress} ${wethAddress} ${uniswapFactoryAddress} ${uniswapRouterV2Address} ${swapPathCreatorAddress} --network ${network}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })