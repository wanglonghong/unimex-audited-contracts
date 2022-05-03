const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');

const UniMexPool = artifacts.require("UniMexPool");
const UniMexFactory = artifacts.require('UniMexFactory');
const Erc20Mock = artifacts.require("ERC20Mock");
const UniswapV2Factory = artifacts.require('UniswapV2FactoryMock');

const toWei = web3.utils.toWei;

contract("UniMexPool", ([alice,user1,user2,user3,user4,user5]) => {

  beforeEach(async () => {
    this.WETH = await Erc20Mock.new("Wrapped ETH", "WETH", alice, 1000);
    this.USDC = await Erc20Mock.new("USDC", "USDC", alice, 1000);
    this.UniswapV2Factory = await UniswapV2Factory.new(alice);
    await this.UniswapV2Factory.createPair(this.WETH.address, this.USDC.address);
    this.factory = await UniMexFactory.new(this.WETH.address, this.UniswapV2Factory.address);
    await this.factory.addPool(this.USDC.address);
    await this.factory.createPool(this.USDC.address);
    const usdcPoolAddress = await this.factory.getPool(this.USDC.address);
    this.pool = await UniMexPool.at(usdcPoolAddress);
    await this.factory.setMarginAllowed(alice, true);
  });

  it("should set WETH address", async () => {
    const scalar = await this.pool.WETH();
    assert.equal(this.WETH.address, scalar);
  });

  it("should test distributed losses mechanism", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.mint(user3, toWei('2000'));
    await this.USDC.mint(user4, toWei('2000'));
    await this.USDC.mint(user5, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user3, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user4, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user5, this.pool.address, toWei('2000'));
    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.withdraw( toWei('200'), { from : user1 });
    assert.equal(0, await this.pool.balanceOf(user1));
    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.deposit( toWei('100'), { from : user2 });
    await this.pool.distributeCorrection( toWei('3'));
    await expectRevert(this.pool.withdraw( toWei('100'), { from : user2 }),"WRONG AMOUNT: CHECK CORRECTED BALANCE");
    await this.pool.withdraw( toWei('99'), { from : user2 });
    assert.equal(toWei('1'), await this.pool.balanceOf(user2));
    await this.pool.deposit( toWei('200'), { from : user3 });
    await this.pool.withdraw( toWei('200'), { from : user3 });
    assert.equal(0, await this.pool.balanceOf(user3));
    await this.pool.deposit( toWei('200'), { from : user2 });
    assert.equal(toWei('201'), await this.pool.balanceOf(user2));
    await this.pool.deposit( toWei('200'), { from : user3 });
    await this.pool.deposit( toWei('200'), { from : user4 });
    await this.pool.deposit( toWei('200'), { from : user5 });
    await this.pool.distributeCorrection( toWei('100'));
    await expectRevert(this.pool.withdraw( toWei('179.01999'), { from : user1 }),"WRONG AMOUNT: CHECK CORRECTED BALANCE");
    await this.pool.withdraw( toWei('178.01998'), { from : user1 });
    assert.equal(toWei('21.98002'), await this.pool.balanceOf(user1));
    await expectRevert(this.pool.withdraw( toWei('180.01999'), { from : user3 }),"WRONG AMOUNT: CHECK CORRECTED BALANCE");
    await this.pool.withdraw( toWei('180.01998'), { from : user3 });
    assert.equal(toWei('19.98002'), await this.pool.balanceOf(user3));
    await this.pool.withdraw( toWei('180.01998'), { from : user4 });
    assert.equal(toWei('19.98002'), await this.pool.balanceOf(user4));
    await this.pool.withdraw( toWei('180.01998'), { from : user5 });
    assert.equal(toWei('19.98002'), await this.pool.balanceOf(user5));
    await expectRevert(this.pool.withdraw( toWei('179.92007993'), { from : user2 }),"WRONG AMOUNT: CHECK CORRECTED BALANCE");
    await this.pool.withdraw( toWei('179.92007992'), { from : user2 });
    assert.equal(toWei('21.07992008'), await this.pool.balanceOf(user2));
  });

  it("should allow to withdraw all if no losses", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));

    await this.pool.deposit(toWei('200'), { from : user1 });
    await this.pool.deposit(toWei('200'), { from : user2 });

    await this.pool.withdraw(toWei('200'), { from : user1 });
    await this.pool.withdraw(toWei('200'), { from : user2 });

    let user1Balance = await this.pool.balanceOf(user1);
    assert.equal(user1Balance.toString(), 0, "wrong user balance after withdrawal");
  });

  it("should allow to withdraw all with losses", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));

    await this.pool.deposit(toWei('200'), { from : user1 });
    await this.pool.deposit(toWei('100'), { from : user2 });

    await this.pool.distributeCorrection(toWei('30'))

    await this.pool.withdraw(toWei('180'), { from : user1 });
    await this.pool.withdraw(toWei('90'), { from : user2 });
  });

  it("should not distribute past losses on new lenders", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));

    await this.pool.deposit(toWei('300'), { from : user1 });

    await this.pool.distributeCorrection(toWei('30'))

    await this.pool.deposit(toWei('100'), { from : user2 });

    await this.pool.distributeCorrection(toWei('40'))
    await this.pool.withdraw(toWei('240'), { from : user1 });
    await this.pool.withdraw(toWei('90'), { from : user2 });

  });

/*  it("should force correction", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));

    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.deposit( toWei('100'), { from : user2 });
    await this.pool.distributeCorrection( toWei('3'));
    await this.pool.withdraw( toWei('198'), { from : user1 });
    await this.pool.withdraw( toWei('99'), { from : user2 });
    await this.pool.correctMyBalance({ from : user1 });
    await this.pool.correctMyBalance({ from : user2 });

    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.withdraw( toWei('200'), { from : user1 });
    assert.equal(2, await this.pool.balanceOf(user1),"correctMyBalance doesn't work");
  });*/

  it("should test correction with transfer", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.mint(user3, toWei('2000'));
    await this.USDC.mint(user4, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user3, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user4, this.pool.address, toWei('2000'));

    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.deposit( toWei('100'), { from : user2 });
    await this.pool.transfer( user2, toWei('100'), { from : user1 } );
    await this.pool.distributeCorrection( toWei('3'));
    await this.pool.withdraw( toWei('99'), { from : user1 });
    await this.pool.withdraw( toWei('198'), { from : user2 });
    assert.equal(toWei('1'), await this.pool.balanceOf(user1), "transfer not good: user1 balance");
    assert.equal(toWei('2'), await this.pool.balanceOf(user2), "transfer not good: user2 balance");

    await this.pool.deposit( toWei('200'), { from : user3 });
    await this.pool.deposit( toWei('100'), { from : user4 });
    await this.pool.distributeCorrection( toWei('30'));
    await this.pool.transfer( user4, toWei('100'), { from : user3 } );
    await this.pool.withdraw( toWei('80'), { from : user3 });
    await this.pool.withdraw( toWei('190'), { from : user4 });
    assert.equal(toWei('10'), await this.pool.balanceOf(user4), "transfer not good: user4 balance");
    assert.equal(toWei('20'), await this.pool.balanceOf(user3), "transfer not good: user3 balance");
  });

  it("should test correctedBalanceOf", async () => {
    await this.USDC.mint(user1, toWei('2000'));
    await this.USDC.mint(user2, toWei('2000'));
    await this.USDC.mint(user3, toWei('2000'));
    await this.USDC.mint(user4, toWei('2000'));
    await this.USDC.approveInternal(user1, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user2, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user3, this.pool.address, toWei('2000'));
    await this.USDC.approveInternal(user4, this.pool.address, toWei('2000'));

    await this.pool.deposit( toWei('200'), { from : user1 });
    await this.pool.deposit( toWei('100'), { from : user2 });
    await this.pool.transfer( user2, toWei('100'), { from : user1 } );
    await this.pool.distributeCorrection( toWei('3'));
    const corrBal1 = await this.pool.correctedBalanceOf(user1);
    const corrBal2 = await this.pool.correctedBalanceOf(user2);
    await this.pool.withdraw( corrBal1.toString(), { from : user1 });
    await this.pool.withdraw( corrBal2.toString(), { from : user2 });
  });

});
