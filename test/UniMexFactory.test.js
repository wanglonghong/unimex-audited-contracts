const { expectRevert } = require('@openzeppelin/test-helpers');

const UniMexPool = artifacts.require('UniMexPool');
const UniMexMargin = artifacts.require('ApeMexMargin');
const UniMexFactory = artifacts.require('UniMexFactory');
const UniMexStaking = artifacts.require('UniMexStaking');
const Erc20Mock = artifacts.require('ERC20Mock');
const UniswapV2Factory = artifacts.require('UniswapV2FactoryMock');

contract('UniMexFactory', ([alice, bob]) => {
    before(async () => {
        this.WETH = await Erc20Mock.new("Wrapped ETH", "WETH", alice, 1000);
        this.USDC = await Erc20Mock.new("UDSC", "USDC", alice, 1000);
        this.USDT = await Erc20Mock.new("USDT", "USDT", alice, 1000);
        this.UNI = await Erc20Mock.new("Uniswap", "UNI", bob, 1000);
        this.UniswapV2Factory = await UniswapV2Factory.new(alice);
        await this.UniswapV2Factory.createPair(this.WETH.address, this.USDC.address);
        await this.UniswapV2Factory.createPair(this.WETH.address, this.USDT.address);
        this.factory = await UniMexFactory.new(this.WETH.address, this.UniswapV2Factory.address);
        this.factory.addPool(this.USDT.address)
        
    });

    it('should set WETH address', async () => {
        const scalar = await this.factory.WETH();
        assert.equal(this.WETH.address, scalar);
    });

    it('should set Uniswap address', async () => {
        const scalar = await this.factory.UNISWAP_FACTORY();
        assert.equal(this.UniswapV2Factory.address, scalar);
    });

    it('should not add pool from not owner', async () => {
        try {
            await this.factory.addPool(this.UNI.address, { from: bob });
        } catch(error) {}
        const allowed = await this.factory.allowed.call(this.UNI.address);
        assert.equal(allowed, false, `Allowed should be false for ${this.UNI.address} when add pool not from contract owner`);
    });

    it('should add pool from owner', async () => {
        await this.factory.addPool(this.USDC.address);
        const allowed = await this.factory.allowed.call(this.USDC.address);
        assert.equal(allowed, true);
    });

    it('should not create not allowed pool', async () => {
        let allowed = await this.factory.allowed.call(this.UNI.address);
        assert.equal(allowed, false, "Allowed should be false by default");
        try {
            await this.factory.createPool(this.UNI.address);
        } catch(e) {
            
        }
        allowed = await this.factory.allowed.call(this.UNI.address);
        assert.equal(allowed, false, "Allowed should be false after creation failed");
        const allPoolsLength = await this.factory.allPoolsLength();
        assert.equal(allPoolsLength, 0, "allPoolsLength should be equal 0 after pool creation failed");
    });
    
    it('should create pool', async () => {
        const tx = await this.factory.createPool(this.USDC.address);
        const createEvent = tx.logs.find(log => log.event === 'OnPoolCreated');
        const createdPoolAddress = createEvent.args.pool;
        const allPoolsLength = await this.factory.allPoolsLength();
        assert.equal(allPoolsLength, 1, "allPoolsLength should be equal 1 after pool creation");
        const poolAddress = await this.factory.getPool(this.USDC.address);
        assert.equal(createdPoolAddress, poolAddress, "Created pool address not equal to saved");
    });

    it('should revert on duplicate pool creation', async () => {
        const tx = await this.factory.createPool(this.USDT.address);
        const createEvent = tx.logs.find(log => log.event === 'OnPoolCreated');
        const createdPoolAddress = createEvent.args.pool;
        const allPoolsLength = await this.factory.allPoolsLength();
        assert.equal(allPoolsLength, 2, "allPoolsLength should be equal 2 after pool creation");
        const poolAddress = await this.factory.getPool(this.USDT.address);
        assert.equal(createdPoolAddress, poolAddress, "Created pool address not equal to saved");

        await expectRevert(this.factory.createPool(this.USDT.address), "POOL_ALREADY_CREATED");
    });
});