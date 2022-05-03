const { expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { assert } = require('chai');

const ProjectDivsDistributor = artifacts.require('ProjectDivsDistributor');
const Erc20Mock = artifacts.require('ERC20Mock');

contract('UniMexFactory', ([deployer, alice, bob, carol]) => {

    beforeEach(async () => {
        this.WETH = await Erc20Mock.new("Wrapped ETH", "WETH", deployer, 1000000);
		this.distributor  = await ProjectDivsDistributor.new([alice, bob, carol], [1000, 7000, 2000])
    });

    it('should set config', async () => {
		await this.distributor.setDistribution([alice], [10000])
    });

    it('should distribute to one address', async () => {
		await this.distributor.setDistribution([alice], [10000])
		await this.distributor.send(20000);

		const aliceBalance = await web3.eth.getBalance(alice)
		await this.distributor.distributeWei();

		const aliceBalanceAfterDistribution = await web3.eth.getBalance(alice)
		assert.equal(new web3.utils.BN(aliceBalance).add(new web3.utils.BN(20000)).toString(), aliceBalanceAfterDistribution.toString(), 
				"wei not distributed")
    });

	it('should distribute token', async()  => {
		await this.WETH.transfer(this.distributor.address, 20000);
		await this.distributor.distributeToken(this.WETH.address);

		const aliceBalance = await this.WETH.balanceOf(alice);
		assert.equal(aliceBalance.toString(), "2000");

		const bobBalance = await this.WETH.balanceOf(bob);
		assert.equal(bobBalance.toString(), "14000");

		const carolBalance = await this.WETH.balanceOf(carol);
		assert.equal(carolBalance.toString(), "4000");

		assert.equal(0, await this.WETH.balanceOf(this.distributor.address), "not all tokens distributed");
	})

	it('should distribute wei', async () => {
		const aliceBalance = await web3.eth.getBalance(alice)
		await this.distributor.send(20000);

		await this.distributor.distributeWei();
		const aliceBalanceAfterDistribution = await web3.eth.getBalance(alice)
		assert.equal(new web3.utils.BN(aliceBalance).add(new web3.utils.BN(2000)).toString(), aliceBalanceAfterDistribution.toString(), 
				"wei not distributed")
	})

});