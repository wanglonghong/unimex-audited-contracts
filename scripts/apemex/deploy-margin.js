const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;
const { deployAndVerify } = require('../utils/deployer')

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const stakingAddress = '0x5D76677bd3F60BE39D6dcaD1CB3fBfFC4256271C'

    const UMX_STAKERS = '0x26589B220030C7dB8472Cf9A19a2CAA2186eec91'
    const TEAM_RESERVE = '0xf6A623c4654327b0C9AB4F63E4f82F2584AaC474'
    const SPACEX = '0xf2DE1128f3e12fd3cD8D6c19538e2C952DBDc2c8'
    const ANOTHER_STAKING = '0x62b9dfCa01A12464408579c8d962A7A577397F14'

    // const stakingFeesDistributor = await deployAndVerify("StakingFeesDistributorProxy", [stakingAddress, 
    //     [UMX_STAKERS, TEAM_RESERVE, SPACEX, ANOTHER_STAKING], [3333, 3333, 1667, 1667]]);
    
    // const stakingFeesDistributorAddress = await stakingFeesDistributor.address;

    const stakingFeesDistributorAddress = '0xD0a9bB1995A163b7d554AdCc3c35d35782E16C65'

    const unimexFactory = '0x393b4d737c474fF681eFd0ec48c7dB73f5E4eBC5';

    const busdAddress = '0xe9e7cea3dedca5984780bafc599bd69add087d56';
    const wethAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const apeswapFactory = '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6';
    const apeswapRouter = '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7';
    const configAddress = '0xD135486fb12DB718E50cfB4Ae5882b5d5D55ea2b';

    //deploy swap path creator
    // const swapPathCreator = await deployAndVerify("SwapPathCreator", [apeswapFactory])
    const swapPathCreator = {address:'0x5335a495e9F58ba334CcD3F1ABbc328f32f92878'};

    const margin = await deployAndVerify("ApeMexMargin", [stakingFeesDistributorAddress, unimexFactory, busdAddress, wethAddress,
        apeswapFactory, apeswapRouter, swapPathCreator.address, configAddress]);
    console.log("done. Margin deployed to " + margin.address)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })