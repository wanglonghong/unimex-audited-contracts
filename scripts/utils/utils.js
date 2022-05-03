
const deployAndVerify = async (contractName, _arguments) => {
	const Contract = await hre.ethers.getContractFactory(contractName);

    arguments = _arguments || []
    console.log("Deploying Contact...");
	console.log(arguments)
    const contract = await Contract.deploy(...arguments);
    console.log(`${contractName} created at: ${contract.address}`);

    await contract.deployed();
    console.log(`${contractName} is deployed`);

    console.log("waiting for 5 confrimations")
    await contract.deployTransaction.wait(5)
    console.log("running verification")

    const networkName = hre.network.name;
    console.log("Network:", networkName);
    // if (networkName != "hardhat") {
    //     console.log("Verifying contract...");
    //     await hre.run("verify:verify", {
    //         address: contract.address,
    //         constructorArguments: arguments,
    //     });
    //     console.log("Contract is Verified");
    // }
	return contract;
}

const verifyContract = async (address, arguments) => {
    const networkName = hre.network.name;
    console.log("Network:", networkName);
    if (networkName != "hardhat") {
        console.log("Verifying contract...");
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: arguments || [],
        });
        console.log("Contract is Verified");
    }
}

const attach = async (contractName, address) => {
	const Contract = await hre.ethers.getContractFactory(contractName);
    return await Contract.attach(address);
}

module.exports = {
	deployAndVerify,
    attach,
    verifyContract
}