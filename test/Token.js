const { expect } = require("chai");

describe("UniMex Token contract", function() {
    it("Deployment should assign the total supply of tokens to the owner", async function() {
        const [owner] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("UniMex");

        const uniMexToken = await Token.deploy();
        const ownerBalance = await uniMexToken.balanceOf(owner.address);
        expect(await uniMexToken.totalSupply()).to.equal(ownerBalance);
    });
});