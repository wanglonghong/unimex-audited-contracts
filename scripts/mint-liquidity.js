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
    console.log('owner: ' + owner.address)

    const pairAddress = '0x709250aB248C66E72Be1Ebe7aB497634d8646edd';
    const pair = await ethers.getContractAt("UniswapV2PairMock", pairAddress);
    await pair.mint(owner.address, { gasLimit: 3000000 })
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })