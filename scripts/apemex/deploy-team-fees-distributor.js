const { ethers } = require("hardhat");
const { BigNumber } = ethers
const { parseEther } = ethers.utils;
const { deployAndVerify } = require('../utils/deployer')

async function main() {
    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

	await deployAndVerify("ProjectDivsDistributor", [
		[
			'0xf6A623c4654327b0C9AB4F63E4f82F2584AaC474',
			'0x76c78D3B6c3132829C9f5f508CDb668c584514ef',
			'0x4180D97b5cfbFcEAF250F9EAf8CEF71119c42AfA',
			'0x04Ddb8ed83C1cbd593619F55579B11CE8B29e3A1',
			'0x5e9c49d9c95e79f853fd6cf8b6065b3995c9b10c',
			'0x4db32F1b39e2C89975c6122D9e904352E968bc3f',
			'0x4C8B86991D688CFF30D3063DA41091B4657dDd87',
			'0xedb477Ca9ADE4d1152666eE914cB279179ffED92',
			'0xd0b342029C97f2A2E65aC660835354438aC64C2E',
			'0xbA044187bdD8e18c2539FfbC4ca0E7826A4a93a5'
		],
		[
			8000,
			534,
			160,
			266,
			53,
			53,
			160,
			53,
			400,
			321
		]
	])



}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })