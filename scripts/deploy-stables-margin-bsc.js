const { ethers } = require("hardhat");

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`deploying from ${owner.address}`)

    const stakingAddress = '0x5D76677bd3F60BE39D6dcaD1CB3fBfFC4256271C'
    const factoryAddress = '0x393b4d737c474fF681eFd0ec48c7dB73f5E4eBC5'
    const busdAddress = '0xe9e7cea3dedca5984780bafc599bd69add087d56'
    const wethAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    const uniswapFactoryAddress = '0xbcfccbde45ce874adcb698cc183debcf17952812'
    const uniswapRouterV2Address = '0x05ff2b0db69458a0750badebc4f9e13add608c7f'
    const swapPathCreatorAddress = '0x461f02c278fdCF43251c94B3d4bFeF697975614b'

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