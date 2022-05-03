const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;

const network = 'bscMainnet'

const unimexFactoryAddress = '0x393b4d737c474fF681eFd0ec48c7dB73f5E4eBC5'
const tokens = [
    '0x7083609fce4d1d8dc0c979aab8c869ea2c873402', //DOT
    '0x3ee2200efb3400fabb9aacf31297cbdd1d435d47', //ADA
    '0xd4cb328a82bdf5f03eb737f37fa6b370aef3e888', //CREAM
    '0x56b6fb708fc5732dec1afc8d8556423a2edccbd6', //EOS
    '0x4338665cbb7b2485a8855a139b75d5e34ab0db94', //LTC
    '0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd', //LINK
    '0x47bead2563dcbf3bf2c9407fea4dc236faba485a', //SXP
]

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    let maxUtilization = BigNumber.from('2').pow(BigNumber.from('64')).sub(1);
    const factory = await ethers.getContractAt("UniMexFactory", unimexFactoryAddress)

    for(let token of tokens) {
        console.log(`\n\n adding pool for ${token}:`)

        console.log('adding token pool...')
        await factory.addPool(token, {gasLimit: 3000000})
        console.log('creating token pool...')
        await factory.createPool(token, { gasLimit: 3000000 })
        console.log('setting token utilization...')
        await factory.setUtilizationScaled(token, maxUtilization)
        console.log('setting token max leverage...')
        await factory.setMaxLeverage(token, 5)
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })