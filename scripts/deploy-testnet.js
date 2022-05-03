const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

// const wethAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
const uniswapFactoryAddress = '0x6725f303b657a9451d8ba641348b6761a6cc7a17'
const uniswapRouterV2Address = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1'

const trustSwap = '0x4d706294E0FbA23C6c269c405A4cf41f74f3fF30'
const yieldx = '0x4d706294E0FbA23C6c269c405A4cf41f74f3fF30'
const team = '0x4d706294E0FbA23C6c269c405A4cf41f74f3fF30'

const network = 'bscTestnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    let maxUtilization = BigNumber.from('2').pow(BigNumber.from('64')).sub(1);

    const UnimexFactory = await ethers.getContractFactory('UniMexFactory')

    const initialBalance = parseEther('1000000');
    const Erc20Mock = await ethers.getContractFactory('ERC20Mock');
    let tokenName = "Test Token";
    let tokenSymbol = "TST";
    const testToken = await Erc20Mock.deploy(tokenName, tokenSymbol, owner.address, initialBalance)
    const testTokenAddress = testToken.address
    console.log(`token: ${testTokenAddress}`)
    console.log(`npx hardhat verify ${testTokenAddress} ${tokenName} ${tokenSymbol} ${owner.address} ${initialBalance} --network ${network}\n\n`)

    let wethName = "WETH";
    let wethSymbol = "WETH";
    const wethToken = await Erc20Mock.deploy(wethName, wethSymbol, owner.address, initialBalance)
    console.log(`WETH token: ${wethToken.address}`)
    console.log(`npx hardhat verify ${wethToken.address} ${wethName} ${wethSymbol} ${owner.address} ${initialBalance} --network ${network}\n\n`)
    const wethAddress = wethToken.address;

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
    console.log(`npx hardhat verify ${stakingAddress} ${uniswapRouterV2Address} ${wethAddress} ${trustSwap} ${yieldx} ${team} --network ${network}\n\n`)
    await staking.setToken(testTokenAddress)
    await testToken.transfer(stakingAddress, 1)

    const UniMexMargin = await ethers.getContractFactory('UniMexMargin')
    const margin = await UniMexMargin.deploy(stakingAddress, factoryAddress, wethAddress,
        uniswapFactoryAddress, uniswapRouterV2Address)
    const marginAddress = margin.address;
    console.log(`margin: ${marginAddress}`)
    console.log(`npx hardhat verify ${marginAddress} ${stakingAddress} ${factoryAddress} ${wethAddress} ${uniswapFactoryAddress} ${uniswapRouterV2Address} --network ${network}\n\n`)

    console.log('setting margin thresholds...')
    await margin.setAmountThresholds('100000000')

    console.log('setting margin allowed...')
    await factory.setMarginAllowed(marginAddress, true)

    // const testTokenAddress = '0xc72d85892FEe84Ac00E7BA10623a1854623d4c19'
    // const wethAddress = '0x45706e9C3c071dBED41b63Ce50e62014B857ddD2'
    // const factoryAddress = '0x436424dDe244D0d123049a1217F3Bb7A1A051F77'
    // const factory = await ethers.getContractAt("UniMexFactory", factoryAddress)

    console.log("adding pair to uniswap")
    const uniswapFactory = await ethers.getContractAt("UniswapV2FactoryMock", uniswapFactoryAddress)
    await uniswapFactory.createPair(testTokenAddress, wethAddress);

    console.log('adding test token pool...')
    await factory.addPool(testTokenAddress, {gasLimit: 3000000})
    console.log('creating test token pool...')
    await factory.createPool(testTokenAddress, { gasLimit: 3000000 })
    console.log('setting test token utilization...')
    await factory.setUtilizationScaled(testTokenAddress, maxUtilization)
    console.log('setting test token max leverage...')
    await factory.setMaxLeverage(testTokenAddress, 5)

    const testTokenPoolAddress = await factory.getPool(testTokenAddress)
    console.log(`test token pool: ${testTokenPoolAddress}`)
    console.log(`npx hardhat verify ${testTokenPoolAddress} --network ${network}\n\n`)

    const pool = await ethers.getContractAt("UniMexPool", testTokenPoolAddress)

    const depositValue = initialBalance.div(BigNumber.from('2'));
    // const depositValue = 1000;
    console.log('approving test tokens to pool')
    await testToken.approve(testTokenPoolAddress, depositValue);
    console.log('depositing test tokens to pool')
    await pool.deposit(depositValue, { gasLimit: 3000000 })

    console.log('adding WETH token pool...')
    await factory.createPool(wethAddress, { gasLimit: 3000000 })
    console.log('setting WETH token utilization...')
    await factory.setUtilizationScaled(wethAddress, maxUtilization, { gasLimit: 3000000})
    console.log('setting WETH token max leverage...')
    await factory.setMaxLeverage(wethAddress, 5, { gasLimit: 3000000})

    const wethPoolAddress = await factory.getPool(wethAddress)
    const wethPool = await ethers.getContractAt("UniMexPool", wethPoolAddress)

    await wethToken.approve(wethPoolAddress, depositValue);
    await wethPool.deposit(depositValue, { gasLimit: 3000000 })

    const depositAmount = parseEther('1')
    console.log('approving to margin')
    await wethToken.approve(marginAddress, depositAmount)
    console.log('depositing to margin')
    await wethToken.approve(marginAddress, depositAmount)
    await margin.deposit(depositAmount)
    console.log('opening a short position')
    await margin.openShortPosition(testTokenAddress, parseEther('0.01'),
        parseEther('4'), 1, { gasLimit: 3000000})
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })