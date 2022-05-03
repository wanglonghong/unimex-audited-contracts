
const deployAndVerify = async (contractName, arguments) => {
	const Contract = await hre.ethers.getContractFactory(contractName);

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
    if (networkName != "hardhat") {
        console.log("Verifying contract...");
        await hre.run("verify:verify", {
            address: contract.address,
            constructorArguments: arguments,
        });
        console.log("Contract is Verified");
    }
	return contract;
}

module.exports = {
	deployAndVerify
}