const { ethers } = require("hardhat");

async function main() {
    const networkName = hre.network.name;
    console.log("Network:", networkName);

    const [owner] = await ethers.getSigners()
    console.log(`running from ${owner.address}`)

    const unimexFactory = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73';

//     const SwapPathCreator = await ethers.getContractFactory('SwapPathCreator');
//     const pathCreator = await SwapPathCreator.deploy(unimexFactory);
//     await pathCreator.deployed();
//     console.log(`path creator deployed to ${config.address}`)
//     console.log(`npx hardhat verify ${pathCreator.address} ${unimexFactory} --network ${networkName}`)

    const address = '0x8B2011a780EeAA1C209E175C57E3eCbfF2944a2B';

    if (networkName != "hardhat") {
        console.log("Verifying contract...");
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [unimexFactory],
        });
        console.log("Contract is Verified");
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })