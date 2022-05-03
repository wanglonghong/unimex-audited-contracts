const { BN, ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');

const UniMexMargin = artifacts.require('ApeMexMargin');
const UnimexConfig = artifacts.require('UnimexConfig');
const UniMexFactory = artifacts.require('UniMexFactory');
const UniMexPool = artifacts.require('UniMexPool');
const UniMexStaking = artifacts.require('UniMexStaking');
const Erc20Mock = artifacts.require('ERC20Mock');
const UniswapV2Factory = artifacts.require('UniswapV2FactoryMock');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02Mock');
const UniswapV2PairMock = artifacts.require('UniswapV2PairMock');
const SwapPathCreator = artifacts.require('SwapPathCreatorMock');

contract('UniMexMargin', ([alice, bob, carol, apeAmmFeesAddress, projectFeesAddress, projectsDivsDistributor]) => {
    before(async () => {
        this.BUSD = await Erc20Mock.new("BUSD", "BUSD", alice, new BN(web3.utils.toWei('1000000000000000')));
        this.WETH = await Erc20Mock.new("WETH", "WETH", alice, new BN(web3.utils.toWei('1000000000000000')));
        this.USDC = await Erc20Mock.new("USDC", "USDC", alice, new BN(web3.utils.toWei('1000000000000000')));

        console.log("weth address is", this.WETH.address)
        console.log("busd address is", this.BUSD.address)
        await this.USDC.transfer(bob, web3.utils.toWei('100000000000'));
        await this.BUSD.transfer(bob, web3.utils.toWei('100000000000'));
        
        this.UniswapV2Factory = await UniswapV2Factory.new(alice);
        this.UniswapV2Router02 = await UniswapV2Router02.new(this.UniswapV2Factory.address, this.BUSD.address);
        await this.USDC.transfer(this.UniswapV2Router02.address, web3.utils.toWei('100000000000'));
        await this.BUSD.transfer(this.UniswapV2Router02.address, web3.utils.toWei('100000000000'));
        await this.WETH.transfer(this.UniswapV2Router02.address, web3.utils.toWei('100000000000'));
        await this.UniswapV2Factory.createPair(this.BUSD.address, this.USDC.address);
        await this.UniswapV2Factory.createPair(this.BUSD.address, this.WETH.address);
        await this.UniswapV2Factory.createPair(this.USDC.address, this.WETH.address);
        this.pair = await UniswapV2PairMock.at(await this.UniswapV2Factory.getPair(this.BUSD.address, this.USDC.address));
        this.busdWethPair = await UniswapV2PairMock.at(await this.UniswapV2Factory.getPair(this.BUSD.address, this.WETH.address));

        await this.USDC.transfer(this.pair.address, web3.utils.toWei('4000000000000'));
        await this.BUSD.transfer(this.pair.address, web3.utils.toWei('4000000000000'));

        await this.WETH.transfer(this.busdWethPair.address, web3.utils.toWei('4000000000000'));
        await this.BUSD.transfer(this.busdWethPair.address, web3.utils.toWei('4000000000000'));

        await this.pair.setReserves(web3.utils.toWei('3500000000000'), web3.utils.toWei('1500000000000'));
        await this.busdWethPair.setReserves(web3.utils.toWei('100000000000'), web3.utils.toWei('100000000000'));

        this.factory = await UniMexFactory.new(this.WETH.address, this.UniswapV2Factory.address);

        // WETH pool added on factory init
        await this.factory.createPool(this.WETH.address);
        await this.factory.setUtilizationScaled(this.WETH.address, new BN('18000000000000000000'));
        await this.factory.setMaxLeverage(this.WETH.address, 4);

        await this.factory.addPool(this.BUSD.address);
        await this.factory.createPool(this.BUSD.address);
        await this.factory.setUtilizationScaled(this.BUSD.address, new BN('18000000000000000000'));
        await this.factory.setMaxLeverage(this.BUSD.address, 4);

        this.staking = await UniMexStaking.new(this.UniswapV2Router02.address, this.WETH.address,
            projectsDivsDistributor);
        this.staking.setToken(this.USDC.address);

        this.swapPathCreator = await SwapPathCreator.new(this.UniswapV2Factory.address);

        this.unimexConfig = await UnimexConfig.new(this.factory.address);

        this.margin = await UniMexMargin.new(this.staking.address, this.factory.address, this.BUSD.address, this.WETH.address,
            this.UniswapV2Factory.address, this.UniswapV2Router02.address, this.swapPathCreator.address, this.unimexConfig.address,
            apeAmmFeesAddress, projectFeesAddress);

        let liquidatorRole = web3.utils.soliditySha3("LIQUIDATOR_ROLE");
        await this.margin.grantRole(liquidatorRole, alice);
        await this.margin.setBorrowPercent(100)

        await this.USDC.transfer(this.staking.address, web3.utils.toWei('10000000'));
        await this.USDC.transfer(this.factory.address, web3.utils.toWei('10000000'));
        await this.USDC.transfer(this.margin.address, web3.utils.toWei('10000000'));

        await this.BUSD.transfer(this.staking.address, web3.utils.toWei('10000000'));
        await this.BUSD.transfer(this.factory.address, web3.utils.toWei('10000000'));
        await this.BUSD.transfer(this.margin.address, web3.utils.toWei('10000000'));

        await this.factory.setMarginAllowed(this.margin.address, true);

        await this.factory.addPool(this.USDC.address);
        await this.factory.createPool(this.USDC.address);
        await this.factory.setUtilizationScaled(this.USDC.address, new BN('18000000000000000000'));
        await this.factory.setMaxLeverage(this.USDC.address, 4);

        const usdcPoolAddress = await this.factory.getPool(this.USDC.address);
        this.usdcPool = await UniMexPool.at(usdcPoolAddress);
        await this.USDC.approve(this.usdcPool.address, web3.utils.toWei('10000000'));
        await this.usdcPool.deposit(web3.utils.toWei('10000000'));

        const wethPoolAddress = await this.factory.getPool(this.BUSD.address);
        this.BUSDPool = await UniMexPool.at(wethPoolAddress);
        await this.BUSD.approve(this.BUSDPool.address, web3.utils.toWei('10000000'));
        await this.BUSDPool.deposit(web3.utils.toWei('10000000'));

        await this.USDC.approve(this.usdcPool.address, web3.utils.toWei('1000'), { from: bob });
        await this.usdcPool.deposit(web3.utils.toWei('1000'), { from: bob });

        await this.margin.setAmountThresholds('100000000');
    });


    it('should set contructor passed addresses', async () => {
        const staking = await this.margin.staking();
        assert.equal(this.staking.address, staking, "should set Staking address");

        const factory = await this.margin.unimex_factory();
        assert.equal(this.factory.address, factory, "should set Factory address");

        const WETH = await this.margin.BASE_TOKEN();
        assert.equal(this.BUSD.address, WETH, "should set WETH address");

        const UniswapV2Factory = await this.margin.uniswap_factory();
        assert.equal(this.UniswapV2Factory.address, UniswapV2Factory, "should set Uniswap address");

        const UniswapV2Router02 = await this.margin.uniswap_factory();
        assert.equal(this.UniswapV2Factory.address, UniswapV2Router02, "should set UniswapV2Router02 address");
    });

    it('should open short position', async () => {
        await this.BUSD.approve(this.margin.address, web3.utils.toWei('90000000000'), {from: bob});
        await this.margin.deposit(web3.utils.toWei('90000000000'), {from: bob});

        const poolBalanceBefore = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const tx = await this.margin.openShortPosition(this.USDC.address, web3.utils.toWei('100'),
            '4000000000000000000', 1, { from: bob });
        console.log('gas used ' + tx.receipt.gasUsed)

        const poolBalanceAfter = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.gt(poolBalanceAfter), true, "USDC pool balance should be lower");
        assert.equal(balanceBefore.gt(balanceAfter), true, "User margin balance should be lower");
        assert.equal(escrowBalanceAfter.gt(escrowBalanceBefore), true, "User margin balance should be greater");

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        const position = await this.margin.positionInfo.call(positionId);
        assert.equal(bob, position.owner);
        assert.equal(web3.utils.toWei('100'), position.owed);
        assert.equal(true, position.isShort);
        // assert.equal(false, position.isClosed);
    });

    it('should close short position', async () => {
        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('1500000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);

        const tx = await this.margin.openShortPosition(this.USDC.address, web3.utils.toWei('100'),
            '4000000000000000000', 1, { from: bob });

        const poolBalanceBefore = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('1600000'));

        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await time.increase(time.duration.days(1));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalanceAfter = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.lt(poolBalanceAfter), true, "USDC pool balance should be greater");
        assert.equal(balanceBefore.lt(balanceAfter), true, "User margin balance should be greater");
        assert.equal(escrowBalanceAfter.lt(escrowBalanceBefore), true, "User margin balance should be lower");

        assert.equal(balanceBeforeOpen.lt(balanceAfter), true,
            `Balance should be greater after close short in profit: ${balanceBeforeOpen.toString()} - ${balanceAfter.toString()}`);

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true);
    });

    it('should close short position with loss', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);

        const tx = await this.margin.openShortPosition(this.USDC.address, web3.utils.toWei('1000'),
            '4000000000000000000', 1, { from: bob });

        const poolBalanceBefore = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReserves(web3.utils.toWei('1100000'), web3.utils.toWei('1000000')); // increase first reserve to make test failed on liquidation check

        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalanceAfter = await this.USDC.balanceOf(this.usdcPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.lt(poolBalanceAfter), true, "USDC pool balance should be greater");
        assert.equal(balanceBefore.lt(balanceAfter), true, "User margin balance should be greater");
        assert.equal(escrowBalanceAfter.lt(escrowBalanceBefore), true, "User margin balance should be lower");

        assert.equal(balanceBeforeOpen.gt(balanceAfter), true,
            `Balance should be lower after close short in loss: ${balanceBeforeOpen.toString()} - ${balanceAfter.toString()}`);

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true);
    });


    it('should open long position', async () => {
        const poolBalance = await this.BUSD.balanceOf(this.BUSDPool.address);
        assert.equal(poolBalance > 0, true);

        const poolBalanceBefore = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const tx = await this.margin.openLongPosition(this.USDC.address, web3.utils.toWei('1000'),
            '4000000000000000000', 1, { from: bob });

        const poolBalanceAfter = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.gt(poolBalanceAfter), true, "WETH pool balance should be lower");
        assert.equal(balanceBefore.gt(balanceAfter), true, "User margin balance should be lower");
        assert.equal(escrowBalanceAfter.gt(escrowBalanceBefore), true, "User margin balance should be greater");

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);
        const position = await this.margin.positionInfo.call(positionId);
        assert.equal(bob, position.owner);
        assert.equal(web3.utils.toWei('1000'), position.owed);
        assert.equal(false, position.isShort);
    });

    

    it('should close long position', async () => {
        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('1500000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);

        const tx = await this.margin.openLongPosition(this.USDC.address, web3.utils.toWei('1000'),
            '4000000000000000000', 1, { from: bob });

        const poolBalanceBefore = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReserves(web3.utils.toWei('1600000'), web3.utils.toWei('1500000'));

        await time.increase(time.duration.days(1));
        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalanceAfter = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.lt(poolBalanceAfter), true, "WETH pool balance should be greater");
        assert.equal(balanceBefore.lt(balanceAfter), true, "User margin balance should be greater");
        assert.equal(escrowBalanceAfter.lt(escrowBalanceBefore), true, "User margin balance should be lower");

        assert.equal(balanceBeforeOpen.lt(balanceAfter), true,
            `Balance should be greater after close long in profit: ${balanceBeforeOpen.toString()} - ${balanceAfter.toString()}`);

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true);
    });

    it('should close long position in loss', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);

        const tx = await this.margin.openLongPosition(this.USDC.address, web3.utils.toWei('1000'),
            '4000000000000000000', 1, { from: bob });

        const poolBalanceBefore = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceBefore = await this.margin.balanceOf(bob);
        const escrowBalanceBefore = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        // increase second reserve to make test failed on liquidation check
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1110000'));

        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalanceAfter = await this.BUSD.balanceOf(this.BUSDPool.address);
        const balanceAfter = await this.margin.balanceOf(bob);
        const escrowBalanceAfter = await this.margin.escrow(bob);

        assert.equal(poolBalanceBefore.lt(poolBalanceAfter), true, "WETH pool balance should be greater");
        assert.equal(balanceBefore.lt(balanceAfter), true, "User margin balance should be greater");
        assert.equal(escrowBalanceAfter.lt(escrowBalanceBefore), true, "User margin balance should be lower");

        assert.equal(balanceBeforeOpen.gt(balanceAfter), true,
            `Balance should be lower after close long in loss: ${balanceBeforeOpen.toString()} - ${balanceAfter.toString()}`);

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true);
    });
    


    it('should liquidate short position', async () => {
        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('1500000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);
        const liquidatorBalance = await this.BUSD.balanceOf(alice);
        const liquidationBonus = await this.margin.calculateAutoCloseBonus();

        const tx = await this.margin.openShortPosition(this.USDC.address, web3.utils.toWei('100'),
            '4000000000000000000', 1, { from: bob });

        const balanceBeforeLiquidate = await this.margin.balanceOf(bob);
        const poolBalanceBeforeLiquidate = await this.USDC.balanceOf(this.usdcPool.address);
        const escrowBalanceBeforeLiquidate = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReserves(web3.utils.toWei('3000000'), web3.utils.toWei('1500000'));

        await expectRevert(this.margin.closePosition(positionId, 1, {from: bob}), "LIQUIDATE ONLY")

        const liquidateTx = await this.margin.liquidatePosition(positionId, 1);

        // console.log("liquidateTx.receipt.gasUsed", liquidateTx.receipt.gasUsed);
        
        const balanceAfterLiquidate = await this.margin.balanceOf(bob);
        const poolBalanceAfterLiquidate = await this.USDC.balanceOf(this.usdcPool.address);
        const escrowBalanceAfterLiquidate = await this.margin.escrow(bob);

        assert.equal(poolBalanceBeforeLiquidate.lt(poolBalanceAfterLiquidate), true,
            "Pool balance should be greater after liquidate");
        assert.equal(escrowBalanceBeforeLiquidate.gt(escrowBalanceAfterLiquidate.add(liquidationBonus)), true,
            "Escrow balance should be lower after liquidate");

        assert.equal(balanceAfterLiquidate.lt(balanceBeforeOpen), true,
            "User balance after liquidate should be lower");
        assert.equal(balanceAfterLiquidate.cmp(balanceBeforeLiquidate), 0,
            "User balance after liquidate should be equal to balance after open position");

        const liquidatorBalanceAfter = await this.BUSD.balanceOf(alice);
        assert.equal(liquidatorBalanceAfter.cmp(liquidatorBalance.add(liquidationBonus)), 0, true,
            "Liquidator balance after liquidate should be greater on liquidation bonus");

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true, "Position should be closed after liquidation");
    });

    it('should liquidate long position', async () => {
        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('1500000'));

        const balanceBeforeOpen = await this.margin.balanceOf(bob);
        const liquidatorBalance = await this.BUSD.balanceOf(alice);
        const liquidationBonus = await this.margin.calculateAutoCloseBonus();

        const tx = await this.margin.openLongPosition(this.USDC.address, web3.utils.toWei('1000'), '4000000000000000000',
            1, { from: bob });

        const balanceBeforeLiquidate = await this.margin.balanceOf(bob);
        const poolBalanceBeforeLiquidate = await this.BUSD.balanceOf(this.BUSDPool.address);
        const escrowBalanceBeforeLiquidate = await this.margin.escrow(bob);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReserves(web3.utils.toWei('1500000'), web3.utils.toWei('3000000'));

        await expectRevert(this.margin.closePosition(positionId, 1, {from: bob}), "LIQUIDATE ONLY")

        const liquidateTx = await this.margin.liquidatePosition(positionId, 1);

        // console.log("liquidateTx.receipt.gasUsed", liquidateTx.receipt.gasUsed);

        const balanceAfterLiquidate = await this.margin.balanceOf(bob);
        const poolBalanceAfterLiquidate = await this.BUSD.balanceOf(this.BUSDPool.address);
        const escrowBalanceAfterLiquidate = await this.margin.escrow(bob);

        assert.equal(poolBalanceBeforeLiquidate.lt(poolBalanceAfterLiquidate), true,
            "Pool balance should be greater after liquidate");
        assert.equal(escrowBalanceBeforeLiquidate.gt(escrowBalanceAfterLiquidate.add(liquidationBonus)), true,
            "Escrow balance should be lower after liquidate");

        assert.equal(balanceAfterLiquidate.lt(balanceBeforeOpen), true,
            "User balance after liquidate should be lower");
        assert.equal(balanceAfterLiquidate.cmp(balanceBeforeLiquidate), 0,
            "User balance after liquidate should be equal to balance after open position");

        const liquidatorBalanceAfter = await this.BUSD.balanceOf(alice);
        assert.equal(liquidatorBalanceAfter.cmp(liquidatorBalance.add(liquidationBonus)), 0,
            "Liquidator balance after liquidate should be greater on liquidation bonus");

        // const position = await this.margin.positionInfo.call(positionId);
        // assert.equal(position.isClosed, true, "Position should be closed after liquidation");
    });

    it('no balance on escrow should be left after position is closed with profit', async() => {
        await this.BUSD.transfer(carol, '100000000000000000000', { from: bob });
        await this.BUSD.approve(this.margin.address, '100000000000000000000', {from: carol});
        await this.margin.deposit('100000000000000000000', {from: carol});

        const tx = await this.margin.openShortPosition(this.USDC.address, '1000000',
            '4000000000000000000', 1, { from: carol });
        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        // const position = await this.margin.positionInfo.call(positionId);

        //close position
        await this.margin.closePosition(positionId, 1, { from: carol });

        const escrowBalanceAfterPositionIsClosed = await this.margin.escrow(carol);
        assert.equal(escrowBalanceAfterPositionIsClosed, '0', 'on escrow should be 0 after position is closed');
    })

    it('should increment nonce after position is opened', async() => {
        const nonceBefore = await this.margin.positionNonce();
        await this.margin.openLongPosition(this.USDC.address, web3.utils.toWei('1000'),
            '4000000000000000000', 1, { from: bob });
        const nonceAfter = await this.margin.positionNonce();
        assert.equal(nonceAfter.sub(nonceBefore), '1', 'nonce should be incremented');
    })
});