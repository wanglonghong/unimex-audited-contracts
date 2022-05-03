const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const networkName = hre.network.name;
    console.log("Network:", networkName);

    const stakingAddress = '0xC5E6AcaF6e1a9F57282612a6D28a273656a779B7'
    const factoryAddress = '0x393b4d737c474fF681eFd0ec48c7dB73f5E4eBC5'
    const busdAddress = '0xe9e7cea3dedca5984780bafc599bd69add087d56'
    const wethAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    const uniswapFactoryAddress = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73' //v2
    const uniswapRouterV2Address = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
    const swapPathCreatorAddress = '0x8b2011a780eeaa1c209e175c57e3ecbff2944a2b'
    const configAddress = '0xD135486fb12DB718E50cfB4Ae5882b5d5D55ea2b';

    const UniMexMargin = await ethers.getContractFactory('ApeMexMargin')
    const margin = await UniMexMargin.deploy(stakingAddress, factoryAddress, busdAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address, swapPathCreatorAddress, configAddress, owner.address, owner.address)
    console.log(`margin: ${margin.address}`)
    await margin.deployed()
    console.log(`npx hardhat verify ${margin.address} ${stakingAddress} ${factoryAddress} ${busdAddress} ${wethAddress} ${uniswapFactoryAddress} ${uniswapRouterV2Address} ${swapPathCreatorAddress} ${configAddress} --network ${network}`)

    if (networkName != "hardhat") {
        console.log("Verifying contract...");
        await hre.run("verify:verify", {
            address: margin.address,
            constructorArguments: [stakingAddress, factoryAddress, busdAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address, swapPathCreatorAddress, configAddress],
        });
        console.log("Contract is Verified");
    }

    const UnimexFactory = await ethers.getContractFactory("UniMexFactory");
    const unimexFactory = await UnimexFactory.attach(factoryAddress)
    console.log("setting margin as allowed")
    await unimexFactory.setMarginAllowed(margin.address, true);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })