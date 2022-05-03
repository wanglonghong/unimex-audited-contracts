const { BN, expectRevert, time, constants } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');

const UniMexMargin = artifacts.require('ApeMexMargin');
const UniMexFactory = artifacts.require('UniMexFactory');
const UniMexPool = artifacts.require('UniMexPool');
const UniMexStaking = artifacts.require('UniMexStaking');
const Erc20Mock = artifacts.require('ERC20Mock');
const UniswapV2Factory = artifacts.require('UniswapV2FactoryMock');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02Mock');
const UniswapV2PairMock = artifacts.require('UniswapV2PairMock');
const SwapPathCreator = artifacts.require('SwapPathCreatorMock');
const UnimexConfig = artifacts.require('UnimexConfig');

const toWei = web3.utils.toWei;

contract('UniMexMargin', ([alice, bob, carol, apeAmmFeesAddress, projectFeesAddress, projectsDivsDistributor]) => {
    beforeEach(async () => {
        this.BUSD = await Erc20Mock.new("BUSD", "BUSD", alice, new BN(web3.utils.toWei('1000000000000000')));
        this.WETH = await Erc20Mock.new("WETH", "WETH", alice, new BN(web3.utils.toWei('1000000000000000')));
        this.USDC = await Erc20Mock.new("USDC", "USDC", alice, new BN(web3.utils.toWei('1000000000000000')));

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
        await this.margin.setBorrowPercent(100)

        let liquidatorRole = web3.utils.soliditySha3("LIQUIDATOR_ROLE");
        await this.margin.grantRole(liquidatorRole, alice);

        await this.USDC.transfer(this.staking.address, web3.utils.toWei('10000000'));
        await this.USDC.transfer(this.factory.address, web3.utils.toWei('10000000'));
        // await this.USDC.transfer(this.margin.address, web3.utils.toWei('10000000'));

        await this.BUSD.transfer(this.staking.address, web3.utils.toWei('10000000'));
        await this.BUSD.transfer(this.factory.address, web3.utils.toWei('10000000'));
        // await this.BUSD.transfer(this.margin.address, web3.utils.toWei('10000000'));

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

        this.wethPoolAddress = await this.factory.getPool(this.WETH.address);
        this.usdcPoolAddress = await this.factory.getPool(this.USDC.address);
        this.busdPoolAddress = await this.factory.getPool(this.BUSD.address);
    });

    it('should not allow to set zero staking address', async() => {
        await expectRevert.unspecified(this.margin.setStaking(constants.ZERO_ADDRESS));
    })

    it('should revert with correct message on no balance on deposit', async() => {
        await this.pair.setReserves(web3.utils.toWei('100000000000'), web3.utils.toWei('100000000000'));
        await this.BUSD.approve(this.margin.address, toWei('24'), {from: bob});
        await this.margin.deposit(toWei('24'), {from: bob});

        await expectRevert(this.margin.openShortPosition(this.USDC.address, toWei('100'),
            '4000000000000000000', 1, { from: bob }), "NO BALANCE");

    })

    it('should not allow to close position not owner', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        await time.increase(time.duration.years(1));

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await expectRevert(this.margin.closePosition(positionId, '1', { from: carol }), "BORROWER ONLY")
    })

    it('should fail on opening position with zero amount', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await expectRevert(this.margin.openShortPosition(this.USDC.address, 0,
            '4000000000000000000', 1, {from: bob}), "ZERO AMOUNT");
    })

    it('should fail on opening position non existing pool', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await expectRevert(this.margin.openShortPosition(carol, toWei('100'),
            '4000000000000000000', 1, {from: bob}), "POOL DOES NOT EXIST");
    })

    it('should fail on opening position with leverage more than max', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await expectRevert(this.margin.openShortPosition(this.USDC.address, toWei('100'),
            '6000000000000000000', 1, {from: bob}), "LEVERAGE EXCEEDS MAX");
    })

    it('should fail on insufficient swap amount on opening position', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await this.pair.setReserves(web3.utils.toWei('100'), web3.utils.toWei('100'));
        await expectRevert(this.margin.openShortPosition(this.USDC.address, toWei('100'),
            '4000000000000000000', toWei('101'), {from: bob}), "INSUFFICIENT SWAP");
    })

    it('should not allow to withdraw more than deposited', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await expectRevert.unspecified(this.margin.withdraw(toWei('1010000000'), {from: bob}))
    })

    it('should correctly close profit short position if fees exceed swap amount', async() => {
        const initialMarginBalance = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(initialMarginBalance, '0', 'initial margin balance should be 0');

        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        await time.increase(time.duration.years(1));

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('900000'), this.USDC.address, toWei('1000000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const marginBalance = await this.BUSD.balanceOf(this.margin.address); //<BN: 5e19c9469ef1abfe7>
        const bobsBalance = await this.margin.balanceOf(bob);
        assert.equal(bobsBalance.toString(), marginBalance.toString(), 'correct contract balance should be set')

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should optimize gas fees on liquidation of short position', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        await this.USDC.transfer(this.margin.address, toWei('100000000'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('110000'), this.USDC.address, toWei('10000'));
        const liquidationTx = await this.margin.liquidatePosition(positionId, 1);
        const gasUsed = liquidationTx.receipt.gasUsed
        console.log(`gas used: ${gasUsed}`)

        assert.equal(gasUsed < 370000, true, "gas exceeds 370k " + gasUsed)
    })

    it('should optimize gas fees on liquidation of long position', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        await this.USDC.transfer(this.margin.address, toWei('100000000'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('70000'), this.USDC.address, toWei('10000'));
        const liquidationTx = await this.margin.liquidatePosition(positionId, 1);
        const gasUsed = liquidationTx.receipt.gasUsed
        console.log(`liquidate long gas used: ${gasUsed}`)

        assert.equal(gasUsed < 300000, true, "gas exceeds 300k")
    })

    it('should not allow to close position twice', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.margin.closePosition(positionId, 1, { from: bob });

        await expectRevert(this.margin.closePosition(positionId, 1, { from: bob }), 'NO OPEN POSITION');
    })

    it('should not allow to liquidate position twice', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('900000'), this.USDC.address, toWei('10000'));
        await this.margin.liquidatePosition(positionId, 1, { from: bob });

        await expectRevert(this.margin.liquidatePosition(positionId, 1, { from: bob }), 'NO OPEN POSITION');
    })

    it('should not fail on return owed tokens to pool, pay fees partially if not enough tokens for fees on short position liquidation', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('110000'), this.USDC.address, toWei('10000'));
        await this.margin.liquidatePosition(positionId, 1);

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees not paid');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'rest of the tokens should be sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should correctly calculate liquidation threshold on a short position', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        //profit
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('900000'), this.USDC.address, toWei('1000000'));
        let canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, false, "should set correct liquidation threshold");

        //loss
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1100000'), this.USDC.address, toWei('1000000'));
        canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, false, "should set correct liquidation threshold");

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1200000'), this.USDC.address, toWei('1000000'));
        canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, true, "should set correct liquidation threshold");
    })

    it('should correctly calculate liquidation threshold on a long position', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        //profit
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('900000'), this.USDC.address, toWei('1000000'));
        let canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, false, "should set correct liquidation threshold");

        //loss
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1100000'));
        canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, false, "should set correct liquidation threshold");

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1200000'));
        canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, true, "should set correct liquidation threshold");

        //liquidation after long time
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await time.increase(time.duration.years(9));
        canLiquidate = await this.margin.canLiquidate(positionId);
        assert.equal(canLiquidate, true, "should set correct liquidation threshold");
    })

    it('should correctly calculate borrow interest', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, '100', '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        const position = await this.margin.positionInfo.call(positionId);
        await time.increaseTo(new BN(position.startTimestamp).add(time.duration.years(1)));

        const borrowInterest = await this.margin.calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        assert.equal(borrowInterest.toString(), '10', 'wrong borrow interest');
    })

    it('should not use updated borrow interest on position close', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});


        const tx = await this.margin.openShortPosition(this.USDC.address, '100', '4000000000000000000', 1, { from: bob });

        await this.margin.setBorrowPercent('10000');

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        const position = await this.margin.positionInfo.call(positionId);

        await time.increaseTo(new BN(position.startTimestamp).add(time.duration.years(1)));

        const borrowInterest = await this.margin.calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        assert.equal(borrowInterest.toString(), '10'.toString(), 'wrong borrow interest');
    })

    it('should use updated borrow interest on position open', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await this.margin.setBorrowPercent('200');

        const tx = await this.margin.openShortPosition(this.USDC.address, '100', '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        const position = await this.margin.positionInfo.call(positionId);

        await time.increaseTo(new BN(position.startTimestamp).add(time.duration.years(1)));

        const borrowInterest = await this.margin.calculateBorrowInterest(position.owed, position.startTimestamp, position.borrowInterest);
        assert.equal(borrowInterest.toString(), '20', 'wrong borrow interest');
    })

    it('should set new borrow interest percent', async () => {
        const borrowInterestPercentScaled = await this.margin.borrowInterestPercentScaled();
        assert.equal(borrowInterestPercentScaled, '100', 'initial percent must be set to 10');

        await this.margin.setBorrowPercent('50');
        const newBorrowInterestPercentScaled = await this.margin.borrowInterestPercentScaled();
        assert.equal(newBorrowInterestPercentScaled, '50', 'borrow percent must be changed');
    })

    it('must allow only owner to change borrow percent', async () => {
        await expectRevert(this.margin.setBorrowPercent('50', { from: bob }), 'ONLY ADMIN');
    })

    it('users main and escrow balances should be correct after short position is closed with profit', async() => {
        const initialMarginBalance = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(initialMarginBalance, '0', 'initial margin balance should be 0');
        
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('900000'), this.USDC.address, toWei('1000000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const marginBalance = await this.BUSD.balanceOf(this.margin.address); //<BN: 5e19c9469ef1abfe7>
        const bobsBalance = await this.margin.balanceOf(bob);
        assert.equal(bobsBalance.toString(), marginBalance.toString(), 'correct contract balance should be set')

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('users main and escrow balances should be correct  after short position is closed with loss', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1100000'), this.USDC.address, toWei('1000000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('users main and escrow balances should be correct after short position is liquidated', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('9000000'), this.USDC.address, toWei('1000000'));
        await this.margin.liquidatePosition(positionId, 1, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('no balance on escrow should be left after long position is closed with profit', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1100000'), this.USDC.address, toWei('1000000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('no balance on escrow should be left after long position is closed with loss', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1100000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('no balance on escrow should be left after long position is liquidated', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('9000000'));
        await this.margin.liquidatePosition(positionId, 1, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should return owed tokens to pool, pay fees and send rest back to users account if enough tokens on short position liquidation', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        //liquidation
        const initialBobsBalance = await this.margin.balanceOf(bob);
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1200000'), this.USDC.address, toWei('1000000'));
        await this.margin.liquidatePosition(positionId, 1);

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees must be paid');

        const bobBalance = await this.margin.balanceOf(bob)
        assert.equal(bobBalance.gt(initialBobsBalance), true, 'rest of the tokens should be sent to Bobs balance');

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should return owed tokens to pool, pay fees partially if not enough tokens for fees on short position liquidation',
            async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.years(5));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1200000'), this.USDC.address, toWei('1000000'));
        await this.margin.liquidatePosition(positionId, 1);

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees were not paid');

        const bobBalance = await this.margin.balanceOf(bob)
        assert.equal(bobBalance.sub(bobInitialBalance).toString(), '0',
            'rest of the tokens should be sent to Bobs balance');
        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should pay partially for pool if its not enough tokens converted on liquidation', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const initialPoolWethBalance = await this.BUSD.balanceOf(this.usdcPoolAddress);
        const poolBalanceAfterPositionWasOpened = await this.USDC.balanceOf(this.usdcPoolAddress);

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.years(5));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('9400000'), this.USDC.address, toWei('1000000'));
        await this.margin.liquidatePosition(positionId, 1);

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(poolBalance.gt(poolBalanceAfterPositionWasOpened), true,
            'some tokens should be returned to the pool');

        const poolWethBalance = await this.BUSD.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.toString(), '0', 'wrong fees');

        const bobBalance = await this.margin.balanceOf(bob)
        assert.equal(bobBalance.sub(bobInitialBalance).toString(), '0',
            'rest of the tokens should be sent to Bobs balance');
        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should allow to liquidate position from any account without liquidator role', async () => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.years(5));

        //liquidation
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('9400000'), this.USDC.address, toWei('1000000'));
        await this.margin.liquidatePosition(positionId, 1, { from: carol } );
    })

    it('margin should have correct balances after short position is closed with loss and with zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        // await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('101000'), this.USDC.address, toWei('10000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees not paid');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after short position is closed with loss with non-zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('101000'), this.USDC.address, toWei('10000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees not paid');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after short position is closed with profit and with zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        // await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10100'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees not paid');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after short position is closed with profit and with non-zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        const initialPoolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10100'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.USDC.balanceOf(this.usdcPoolAddress);
        assert.equal(initialPoolBalance.toString(), poolBalance.toString(), 'not all tokens were returned to the pool');

        const poolWethBalance = await this.WETH.balanceOf(this.usdcPoolAddress);
        const fees = poolWethBalance.sub(initialPoolWethBalance);
        assert.equal(fees.gt(new BN('0')), true, 'fees not paid');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should add commitment to an opened position', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        const position = await this.margin.positionInfo.call(positionId);

        const initialCommitment = position.commitment;

        const initialMarginBalance = await this.BUSD.balanceOf(this.margin.address);
        await this.BUSD.approve(this.margin.address, '100', { from: bob })
        await this.margin.addCommitmentToPosition(positionId, '100', { from: bob });

        const marginBalance = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(marginBalance.sub(initialMarginBalance), '100', 'weth tokens were not transferred to the margin');

        const alteredPosition = await this.margin.positionInfo.call(positionId);
        assert.equal(alteredPosition.commitment.sub(initialCommitment), '100', 'commitment should increase');
    })

    it('margin should have correct balances after long position is closed with profit and with zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        // await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('101000'), this.USDC.address, toWei('10000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        assert.equal(poolBalance.toString(), initialPoolBalance.toString(), 'tokens and fees should be returned to the pool');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const busdInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), busdInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after long position is closed with profit with non-zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('101000'), this.USDC.address, toWei('10000'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        assert.equal(poolBalance.toString(), initialPoolBalance.toString(), 'tokens and fees should be returned to the pool');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const busdInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), busdInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after long position is closed with loss and with zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        // await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10100'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        assert.equal(poolBalance.toString(), initialPoolBalance.toString(), 'tokens and fees should be returned to the pool');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const busdInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), busdInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('margin should have correct balances after long position is closed with loss and with non-zero borrow fees', async () => {
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10000'));
        await this.BUSD.approve(this.margin.address, toWei('10000'), {from: bob});
        await this.margin.deposit(toWei('10000'), {from: bob});

        const initialPoolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        const initialPoolWethBalance = await this.BUSD.balanceOf(this.wethPoolAddress);
        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1, { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;

        await time.increase(time.duration.weeks(10));

        const bobInitialBalance = await this.margin.balanceOf(bob)

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('100000'), this.USDC.address, toWei('10100'));
        await this.margin.closePosition(positionId, 1, { from: bob });

        const poolBalance = await this.BUSD.balanceOf(this.busdPoolAddress);
        assert.equal(poolBalance.toString(), initialPoolBalance.toString(), 'tokens and fees should be returned to the pool');

        const bobBalance = await this.margin.balanceOf(bob);
        const returnAmount = bobBalance.sub(bobInitialBalance)
        assert.equal(returnAmount.gt(new BN('0')), true, 'tokens not sent to Bobs balance');

        //check invariants
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobBalance.toString(), wethInMargin.toString(), 'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use updated commitment on long position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1400000'));
        await expectRevert(this.margin.closePosition(positionId, 1, {from: bob}), "LIQUIDATE ONLY");

        await this.BUSD.approve(this.margin.address, toWei('100'), { from: bob })
        await this.margin.addCommitmentToPosition(positionId, toWei('100'), { from: bob });

        await this.margin.closePosition(positionId, 1, {from: bob});

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use updated commitment on short position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1400000'), this.USDC.address, toWei('1000000'));
        await expectRevert(this.margin.closePosition(positionId, 1, {from: bob}), "LIQUIDATE ONLY");

        await this.BUSD.approve(this.margin.address, toWei('100'), { from: bob })
        await this.margin.addCommitmentToPosition(positionId, toWei('100'), { from: bob });

        await this.margin.closePosition(positionId, 1, {from: bob});

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new big liquidation bonus no short position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        const positionAmount = toWei('1')
        await this.BUSD.approve(this.margin.address, positionAmount, {from: bob});
        await this.margin.deposit(positionAmount, {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, positionAmount, '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1100000'), this.USDC.address, toWei('1000000'));
        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice('500000000000'); //5e17
        await this.margin.liquidatePosition(positionId, 1);

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new bigger liquidation bonus on short position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1300000'), this.USDC.address, toWei('1000000'));
        // await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice('500000000');
        await this.margin.liquidatePosition(positionId, 1);

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new smaller liquidation bonus on short position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1300000'), this.USDC.address, toWei('1000000'));
        // await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice('100000000');

        const autoCloseBonus = await this.margin.calculateAutoCloseBonus()
        const initialAliceBalance = await this.BUSD.balanceOf(alice)
        await this.margin.liquidatePosition(positionId, 1);
        const aliceBalance = await this.BUSD.balanceOf(alice)
        assert.equal(aliceBalance.sub(initialAliceBalance).toString(), autoCloseBonus.toString(), "auto close bonus not sent")

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new big liquidation bonus on long position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('1'), {from: bob});
        await this.margin.deposit(toWei('1'), {from: bob});
        await this.margin.setThresholdGasPrice("1");

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('1'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1100000'));
        await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice("500000000000");
        // await this.margin.setLiquidationBonus("5000000000000000000000");
        await this.margin.liquidatePosition(positionId, 1);

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new bigger liquidation bonus on long position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1300000'));
        // await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice('330000000'); //10% bigger
        await this.margin.liquidatePosition(positionId, 1);

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should use new smaller liquidation bonus on long position liquidation', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, toWei('1300000'));
        // await expectRevert(this.margin.liquidatePosition(positionId, 1), "CANNOT_LIQUIDATE");

        await this.margin.setThresholdGasPrice('50000000000');
        await this.margin.liquidatePosition(positionId, 1);

        // check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('it not should fail with liquidation on zero swap', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openLongPosition(this.USDC.address, toWei('100'), '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.pair.setReservesByTokens(this.BUSD.address, '1', this.USDC.address, toWei('9000000'));
        await this.margin.liquidatePosition(positionId, 0, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should liquidate with with lb taking all collateral', async() => {
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const tx = await this.margin.openShortPosition(this.USDC.address, '10000', '4000000000000000000', 1,
            { from: bob });

        const createEvent = tx.logs.find(log => log.event === 'OnOpenPosition');
        const positionId = createEvent.args.positionId;
        assert.equal(!!positionId, true);

        await this.margin.setThresholdGasPrice('500000000000')
        await this.pair.setReservesByTokens(this.BUSD.address, toWei('1000000'), this.USDC.address, '1');
        await this.margin.liquidatePosition(positionId, 0, { from: bob });

        //check invariants
        const bobsBalance = await this.margin.balanceOf(bob);
        const wethInMargin = await this.BUSD.balanceOf(this.margin.address);
        assert.equal(bobsBalance.toString(), wethInMargin.toString(),
            'invariant: margin balance should be equal to sum of balances');
        const tokenInMargin = await this.USDC.balanceOf(this.margin.address);
        assert.equal(tokenInMargin, '0', 'invariant: no tokens should be left in margin after positions are closed');
        const escrowBalance = await this.margin.escrow(bob)
        assert.equal(escrowBalance, '0', 'invariant: no tokens should be left on escrow after positions are closed');
    })

    it('should new set staking contract', async () => {
        await this.margin.setStaking(carol)
        const newStaking = await this.margin.staking()
        assert.equal(newStaking, carol, 'staking not set');
    })

    it('should set paused state', async() => {
        await this.margin.pause()
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        await expectRevert(this.margin.openShortPosition(this.USDC.address, '10000', '4000000000000000000', 1,
            { from: bob }), "PAUSED");
    })

    it('should unpause contract', async() => {
        await this.margin.pause()
        await this.margin.unpause()
        await this.pair.setReserves(web3.utils.toWei('1000000'), web3.utils.toWei('1000000'));
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        this.margin.openShortPosition(this.USDC.address, '10000', '4000000000000000000', 1,
            { from: bob }) //should open without exception
    })

    it('should withdraw deposited balance from margin', async() => {
        await this.BUSD.approve(this.margin.address, toWei('100'), {from: bob});
        await this.margin.deposit(toWei('100'), {from: bob});

        const initialBobsBalance = await this.BUSD.balanceOf(bob)
        await this.margin.withdraw(toWei('100'), {from: bob});
        const bobsBalance = await this.BUSD.balanceOf(bob)
        assert.equal(bobsBalance.sub(initialBobsBalance), toWei('100'), 'amount not withdrawn')
    })

    it('only liquidator can set threshold gas price', async () => {
        await expectRevert(this.margin.setThresholdGasPrice(100, { from: carol }), "NOT LIQUIDATOR");
    })

});