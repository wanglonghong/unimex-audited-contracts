const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

const wethAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; //wrapped BNB
const uniswapFactoryAddress = '0xBCfCcbde45cE874adCB698cC183deBcF17952812'; //pancake factory
const uniswapRouterV2Address = '0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F'; //pancake router

const trustSwap = '0x99b8f0f49971f078edc8b8bfe48da6344e65db3f'
const yieldx = '0xa0f4d4e55e10a9f55dd5ea665ff41b8d632e3b6f'
const team = '0x9857a29b5810049cbe9d83c34f122c23420b2d44'
const tokenAddress = '0x72f28c09be1342447fa01Ebc76eF508473d08c5c' //DGN token

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    let maxUtilization = BigNumber.from('2').pow(BigNumber.from('64')).sub(1);

    const UnimexFactory = await ethers.getContractFactory('UniMexFactory')

    const factory = await UnimexFactory.deploy(wethAddress, uniswapFactoryAddress)
    const factoryAddress = factory.address;
    console.log(`factory: ${factoryAddress}`)
    console.log(`npx hardhat verify ${factoryAddress} ${wethAddress} ${uniswapFactoryAddress} --network ${network}\n\n`)

    await factory.createPool(wethAddress)
    console.log(`max utilization ${maxUtilization}`)
    await factory.setUtilizationScaled(wethAddress, maxUtilization)
    await factory.setMaxLeverage(wethAddress, 5)

    const UniMexStaking = await ethers.getContractFactory('UniMexStaking')
    const staking = await UniMexStaking.deploy(uniswapRouterV2Address, wethAddress,
        trustSwap, yieldx, team)
    const stakingAddress = staking.address;
    console.log(`staking: ${stakingAddress}`)
    console.log(`npx hardhat verify ${stakingAddress} ${uniswapRouterV2Address} ${tokenAddress} ${trustSwap} ${yieldx} ${team} --network ${network}\n\n`)
    await staking.setToken(tokenAddress)
    // await testToken.transfer(stakingAddress, 1) //manually

    const UniMexMargin = await ethers.getContractFactory('UniMexMargin')
    const margin = await UniMexMargin.deploy(stakingAddress, factoryAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address)
    const marginAddress = margin.address;
    console.log(`margin: ${marginAddress}`)
    console.log(`npx hardhat verify ${marginAddress} ${stakingAddress} ${factoryAddress} ${wethAddress} ${uniswapFactoryAddress} ${uniswapRouterV2Address} --network ${network}\n\n`)

    console.log('setting margin thresholds...')
    // await margin.setAmountThresholds('100000000')

    console.log('setting margin allowed...')
    await factory.setMarginAllowed(marginAddress, true)

    // const testTokenAddress = '0xc72d85892FEe84Ac00E7BA10623a1854623d4c19'
    // const wethAddress = '0x45706e9C3c071dBED41b63Ce50e62014B857ddD2'
    // const factoryAddress = '0x436424dDe244D0d123049a1217F3Bb7A1A051F77'
    // const factory = await ethers.getContractAt("UniMexFactory", factoryAddress)

    // console.log("adding pair to uniswap")
    // const uniswapFactory = await ethers.getContractAt("UniswapV2FactoryMock", uniswapFactoryAddress)
    // await uniswapFactory.createPair(tokenAddress, wethAddress);

    // console.log('adding test token pool...')
    // await factory.addPool(tokenAddress, { gasLimit: 3000000})
    // console.log('creating test token pool...')
    // await factory.createPool(tokenAddress, { gasLimit: 3000000 })
    // console.log('setting test token utilization...')
    // await factory.setUtilizationScaled(tokenAddress, maxUtilization)
    // console.log('setting test token max leverage...')
    // await factory.setMaxLeverage(tokenAddress, 5)

    // const tokenPoolAddress = await factory.getPool(tokenAddress)
    // console.log(`test token pool: ${tokenPoolAddress}`)
    // console.log(`npx hardhat verify ${tokenPoolAddress} --network ${network}\n\n`)

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })