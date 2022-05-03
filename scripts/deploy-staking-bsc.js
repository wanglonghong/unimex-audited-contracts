const { ethers } = require("hardhat");
const { BigNumber } = ethers

const wethAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; //wrapped BNB
const uniswapFactoryAddress = '0xBCfCcbde45cE874adCB698cC183deBcF17952812'; //pancake factory
const uniswapRouterV2Address = '0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F'; //pancake router

const trustSwap = '0x99b8f0f49971f078edc8b8bfe48da6344e65db3f'
const yieldx = '0xa0f4d4e55e10a9f55dd5ea665ff41b8d632e3b6f'
const team = '0x9857a29b5810049cbe9d83c34f122c23420b2d44'
const umxStakers = '0x8607221DaB03a47d5A201fe2895309d4aac1d91f'
const tokenAddress = '0x72f28c09be1342447fa01Ebc76eF508473d08c5c' //DGN token

const network = 'bscMainnet'

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const UniMexStaking = await ethers.getContractFactory('UniMexStaking')
    const staking = await UniMexStaking.deploy(uniswapRouterV2Address, wethAddress,
        trustSwap, yieldx, team, umxStakers)
    const stakingAddress = staking.address;
    console.log(`staking: ${stakingAddress}`)
    console.log(`npx hardhat verify ${stakingAddress} ${uniswapRouterV2Address} ${wethAddress} ${trustSwap} ${yieldx} ${team} ${umxStakers} --network ${network}\n\n`)
    await staking.setToken(tokenAddress)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })