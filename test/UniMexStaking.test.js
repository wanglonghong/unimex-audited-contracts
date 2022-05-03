const { BN, ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');

const UniMexStaking = artifacts.require('UniMexStaking')
const Erc20Mock = artifacts.require('ERC20Mock')
const UniswapV2Factory = artifacts.require('UniswapV2FactoryMock');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02Mock');
const UniswapV2PairMock = artifacts.require('UniswapV2PairMock');

const toWei = web3.utils.toWei;

contract('UniMexStaking', ([alice, projects, newProjects, bob, umxStakers]) => {

    beforeEach(async () => {
        this.token = await Erc20Mock.new('Test', 'TST', bob, toWei('1000000000000000'), { from: bob});
        this.WETH = await Erc20Mock.new("Wrapped ETH", "WETH", bob, toWei('1000000000000000'), { from: bob });

        this.token.transfer(alice, '1000', { from: bob })
        this.WETH.transfer(alice, '1000', { from: bob })
        this.UniswapV2Factory = await UniswapV2Factory.new(alice);
        this.UniswapV2Router02 = await UniswapV2Router02.new(this.UniswapV2Factory.address, this.WETH.address);

        await this.token.transfer(this.UniswapV2Router02.address, web3.utils.toWei('100000000000'), {from: bob});
        await this.WETH.transfer(this.UniswapV2Router02.address, web3.utils.toWei('100000000000'), {from: bob});
        await this.UniswapV2Factory.createPair(this.WETH.address, this.token.address);
        this.pair = await UniswapV2PairMock.at(await this.UniswapV2Factory.getPair(this.WETH.address, this.token.address));

        await this.token.transfer(this.pair.address, web3.utils.toWei('4000000000000'), {from: bob});
        await this.WETH.transfer(this.pair.address, web3.utils.toWei('4000000000000'), {from: bob});

        await this.pair.setReserves(web3.utils.toWei('100000000000'), web3.utils.toWei('100000000000'));


        this.staking = await UniMexStaking.new(this.UniswapV2Router02.address, this.WETH.address, 
            projects);
        await this.staking.setToken(this.token.address);
    });

    it('should not set token if already set', async () => {
        await expectRevert.unspecified(this.staking.setToken(this.token.address));
    });

    it('distribute divs should work', async() => {
        await this.token.transfer(this.staking.address, 100);
        await this.staking.distribute(0);
        let divPerShare = await this.staking.divPerShare();
        assert.equal(0, divPerShare);
        await this.WETH.approve(this.staking.address, 20)
        await this.staking.distribute(20);
        await this.staking.updatePendingDivs();

        await this.staking.distributeDivs();

        const projectsDivDistributorBalance = await this.WETH.balanceOf(projects);
        assert.equal(projectsDivDistributorBalance, '17', 'projects divs should be distributed');
    })

    it('should distribute all divs after everything has been claimed', async() => {
        await this.token.transfer(this.staking.address, 1);
        
        await this.token.approve(this.staking.address, 100)
        await this.staking.deposit(100)

        //add divs
        await this.WETH.approve(this.staking.address, 20)
        await this.staking.distribute(20);

        await this.staking.claim();
        await this.staking.distributeDivs();

        const balanceAfterClaim = await this.WETH.balanceOf(this.staking.address);
        assert.equal(balanceAfterClaim, '1', 'should distribute all divs');
    })

    it('reinvest should work', async() => {
        await this.token.transfer(this.staking.address, 1);
        
        await this.token.approve(this.staking.address, 10000)
        await this.token.mint(alice, 10000);
        await this.WETH.mint(alice, 10000);
        await this.staking.deposit(10000)

        //add divs
        await this.WETH.approve(this.staking.address, 2000)
        await this.staking.distribute(2000);
        await this.staking.updatePendingDivs();

        const alicesDivs = await this.staking.dividendsOf(alice)
        assert.equal(alicesDivs.toString(), '249');
        const tx = await this.staking.reinvestWithMinimalAmountOut(1000, 623);

        const event = tx.logs.find(log => log.event === 'OnDeposit');
        const depositedAmount = event.args.amount;
        assert.equal(depositedAmount.toString(), '248', 'should deposit converted amount of tokens');
    })

    it('should update projects distributor address', async() => {
        await this.staking.setProjectsDivsDistributorAddress(newProjects);
        const newAddress = await this.staking.projectsDivsDistributorAddress();
        assert.equal(newAddress, newProjects);
    })

    it('distribution should work', async () => {
        await this.token.transfer(this.staking.address, 100);

        let divPerShare = await this.staking.divPerShare();
        assert.equal(0, divPerShare);

        await this.WETH.approve(this.staking.address, 20)
        await this.staking.distribute(20);
        await this.staking.updatePendingDivs();

        divPerShare = await this.staking.divPerShare();
        // console.log('div per share', divPerShare.toString())
        assert.equal(divPerShare.toString(), '553402322211286548');

        await this.token.approve(this.staking.address, 100)
        await this.staking.deposit(100)

        let aliceTokenBalance = await this.token.balanceOf(alice)
        assert.equal(aliceTokenBalance, '800')
        
        await this.WETH.approve(this.staking.address, 100)
        await this.staking.distribute('100');
        await this.staking.updatePendingDivs();

        divPerShare = await this.staking.divPerShare();
        
        // console.log('div per share', divPerShare.toString())
        assert.equal(divPerShare.toString(), '1752440687002407403');

        await this.staking.withdraw(100);
        
        assert.equal((await this.staking.dividendsOf(alice)), '6')

        aliceTokenBalance = await this.token.balanceOf(alice)
        assert.equal(aliceTokenBalance, '900')

        const balanceBeforeClaim = await this.WETH.balanceOf(alice)
        await this.staking.claim()
        const balanceAfterClaim = await this.WETH.balanceOf(alice)

        aliceTokenBalance = await this.token.balanceOf(alice)
        assert.equal(balanceAfterClaim.valueOf() - balanceBeforeClaim.valueOf(), '6')
    })

    
})
