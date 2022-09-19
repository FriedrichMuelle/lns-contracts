const ENS = artifacts.require('./registry/ENSRegistry');
const PublicResolver = artifacts.require('./resolvers/PublicResolver');
const BaseRegistrar = artifacts.require('./NamedBaseRegistrar');
const NFTRegistrarController = artifacts.require('./NFTRegistrarController');
const NFTNativePriceOracle = artifacts.require('./NFTNativePriceOracle');
const { evm, exceptions } = require("../test-utils");
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const ERC721Mock = artifacts.require('./ERC721Mock');
const namehash = require('eth-ens-namehash');
const { assert, expect } = require("chai");
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;
const { BigNumber } = require('ethers');
const { web3 } = require("hardhat");
require('hardhat-deploy-ethers')

const DAYS = 24 * 60 * 60;
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000"
const secret = "0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";

contract('NFTNativePriceOracle', function (accounts) {
    let ens;
    let resolver;
    let baseRegistrar;
    let controller;
    let nameWrapper;
    let PromoregisterHelper;
    let priceOracle;
    let NFT;

    const ownerAccount = accounts[0]; // Account that owns the registrar
    const someone = accounts[2];

    const yearInSeconds = 31556951;
    const eth = BigNumber.from("1000000000000000000");
    const bnEth = ("999999999968834010"); // rent price per year, with rounding error

    beforeEach(async () => {
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        resolver = await PublicResolver.new(ens.address, nameWrapper.address);

        baseRegistrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), 'eth', {from: ownerAccount});
        await ens.setSubnodeOwner('0x0', sha3('eth'), baseRegistrar.address);

        NFT = await ERC721Mock.new("NFT Token", "NFT");

        // 1 eth per year, 5 percent discount
        priceOracle = await NFTNativePriceOracle.new([eth.mul(1).div(yearInSeconds)], []);

        controller = await NFTRegistrarController.new(
            baseRegistrar.address,
            priceOracle.address,
            0,
            86400,
            {from: ownerAccount});
        await baseRegistrar.addController(controller.address, {from: ownerAccount});
        await controller.setPriceOracle(priceOracle.address, {from: ownerAccount});
    });

    it('should not allow other users to call ownable methods', async () => {
        await exceptions.expectFailure(priceOracle.addEligibleCollection(NULL_ADDRESS, {from: someone}));
        await exceptions.expectFailure(priceOracle.removeEligibleCollection(NULL_ADDRESS, {from: someone}));
        await exceptions.expectFailure(priceOracle.setRequiredNFTs(2, {from: someone}));
        await exceptions.expectFailure(priceOracle.setPrices([], {from: someone}));
        await exceptions.expectFailure(priceOracle.setDiscounts([], {from: someone}));
    });

    it('should calculate price without discount if no collections were allowed', async () => {
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), bnEth);
        assert.equal(await priceOracle.getBasePrice("test", 0, yearInSeconds), bnEth);
        assert.equal(await priceOracle.getDiscountedPrice(bnEth, ownerAccount), bnEth);
        const breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, false);
        assert.equal(breakdown.nftAmount, 0);
        assert.equal(breakdown.requiredNftAmount, 0);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, bnEth);
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([]));
    });

    it('should allow owner to add collection to eligible list and set discounts', async () => {
        await priceOracle.addEligibleCollection(NFT.address);
        await priceOracle.setDiscounts([50, 100, 200]);

        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), bnEth);

        await NFT.mint(ownerAccount);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), toBN(bnEth).mul(toBN(950)).div(toBN(1000)).toString());

        await NFT.mint(ownerAccount);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), toBN(bnEth).mul(toBN(900)).div(toBN(1000)).toString());

        await NFT.mint(ownerAccount);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), toBN(bnEth).mul(toBN(800)).div(toBN(1000)).toString());

        await NFT.mint(ownerAccount);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), toBN(bnEth).mul(toBN(800)).div(toBN(1000)).toString());

        const breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, true);
        assert.equal(breakdown.nftAmount, 4);
        assert.equal(breakdown.requiredNftAmount, 0);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, toBN(bnEth).mul(toBN(800)).div(toBN(1000)).toString());
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([NFT.address]));

        await NFT.burn(0);
        await NFT.burn(1);
        await NFT.burn(2);

        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), toBN(bnEth).mul(toBN(950)).div(toBN(1000)).toString());
    });

    it('should set required NFTs and respect it', async () => {
        await priceOracle.addEligibleCollection(NFT.address);
        await priceOracle.setDiscounts([50, 100, 200]);
        await NFT.mint(ownerAccount);

        await priceOracle.setRequiredNFTs(1);

        const breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, true);
        assert.equal(breakdown.nftAmount, 1);
        assert.equal(breakdown.requiredNftAmount, 1);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, toBN(bnEth).mul(toBN(950)).div(toBN(1000)).toString());
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([NFT.address]));

        assert.equal((await priceOracle.price("test", 0, yearInSeconds, ownerAccount)).toString(), toBN(bnEth).mul(toBN(950)).div(toBN(1000)).toString());

        await priceOracle.setRequiredNFTs(2);
        await exceptions.expectFailure(priceOracle.price("test", 0, yearInSeconds, ownerAccount));

        await NFT.mint(ownerAccount);
        await exceptions.expectSuccess(priceOracle.price("test", 0, yearInSeconds, ownerAccount));
        assert.equal((await priceOracle.price("test", 0, yearInSeconds, ownerAccount)).toString(), toBN(bnEth).mul(toBN(900)).div(toBN(1000)).toString());
    });

    it('should allow to register with 0 NFTS, enough NFTS and fail with not enough NFTS', async () => {
        let commitment;

        await priceOracle.addEligibleCollection(NFT.address);
        await priceOracle.setDiscounts([500]);


        await priceOracle.setRequiredNFTs(0);

        commitment = await controller.makeCommitment("newname", ownerAccount, secret);
        await controller.commit(commitment);
        await controller.register("newname", ownerAccount, yearInSeconds, secret, {value: eth});


        await NFT.mint(ownerAccount);
        await priceOracle.setRequiredNFTs(1);

        commitment = await controller.makeCommitment("newname2", ownerAccount, secret);
        await controller.commit(commitment);
        await controller.register("newname2", ownerAccount, yearInSeconds, secret, {value: eth});


        await priceOracle.setRequiredNFTs(2);

        await exceptions.expectFailure(priceOracle.price("newname3", 0, yearInSeconds, ownerAccount));
        commitment = await controller.makeCommitment("newname3", ownerAccount, secret);
        await controller.commit(commitment);
        await exceptions.expectFailure(controller.register("newname3", ownerAccount, yearInSeconds, secret, {value: eth}));


        await priceOracle.setRequiredNFTs(1);

        // registers with half ether because of discount
        commitment = await controller.makeCommitment("newname4", ownerAccount, secret);
        await controller.commit(commitment);
        await controller.register("newname4", ownerAccount, yearInSeconds, secret, {value: eth.div(2)});


        // does not register with 1/3 ether
        commitment = await controller.makeCommitment("newname5", ownerAccount, secret);
        await controller.commit(commitment);
        await exceptions.expectFailure(controller.register("newname5", ownerAccount, yearInSeconds, secret, {value: eth.div(3)}));
    });

    it('should support interface', async () => {
        assert.equal(await priceOracle.supportsInterface("0x852ae872"), true); // NFT_ORACLE_ID
    });

    it('should return data from getters', async () => {
        await priceOracle.addEligibleCollection(NFT.address);
        assert.equal(JSON.stringify(await priceOracle.getNftCollectionsEligibleForDiscount()), JSON.stringify([NFT.address]));

        await priceOracle.setPrices([1,2,3]);
        assert.equal(JSON.stringify(await priceOracle.getRentPrices()), JSON.stringify(["1","2","3"]));

        await priceOracle.setDiscounts([1,2,3]);
        assert.equal(JSON.stringify(await priceOracle.getDiscounts()), JSON.stringify(["1","2","3"]));
    });

    it('should handle collection removal', async () => {
        let breakdown;

        breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, false);
        assert.equal(breakdown.nftAmount, 0);
        assert.equal(breakdown.requiredNftAmount, 0);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, bnEth);
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([]));

        assert.equal(await priceOracle.countNFTs(ownerAccount), 0);
        await priceOracle.addEligibleCollection(NFT.address);

        await NFT.mint(ownerAccount);
        assert.equal(await priceOracle.countNFTs(ownerAccount), 1);

        breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, true);
        assert.equal(breakdown.nftAmount, 1);
        assert.equal(breakdown.requiredNftAmount, 0);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, bnEth);
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([NFT.address]));

        await priceOracle.removeEligibleCollection(NFT.address);

        breakdown = await priceOracle.getNamePriceBreakdown("test", 0, yearInSeconds, ownerAccount);
        assert.equal(breakdown.canRegisterName, true);
        assert.equal(breakdown.isEligibleForDiscount, false);
        assert.equal(breakdown.nftAmount, 0);
        assert.equal(breakdown.requiredNftAmount, 0);
        assert.equal(breakdown.basePrice, bnEth);
        assert.equal(breakdown.discountedPrice, bnEth);
        assert.equal(JSON.stringify(breakdown.collections), JSON.stringify([]));
    })

    it('should handle static calls', async () => {
        assert.equal(await priceOracle.countNFTs(ownerAccount), 0);
        assert.equal(await priceOracle.countNFTs(NULL_ADDRESS), 0);
        assert.equal(await priceOracle.countNFTs(someone), 0);

        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), bnEth);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, NULL_ADDRESS), bnEth);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, someone), bnEth);

        await priceOracle.addEligibleCollection(NFT.address);

        assert.equal(await priceOracle.countNFTs(ownerAccount), 0);
        assert.equal(await priceOracle.countNFTs(NULL_ADDRESS), 0);
        assert.equal(await priceOracle.countNFTs(someone), 0);

        assert.equal(await priceOracle.price("test", 0, yearInSeconds, ownerAccount), bnEth);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, NULL_ADDRESS), bnEth);
        assert.equal(await priceOracle.price("test", 0, yearInSeconds, someone), bnEth);

        await priceOracle.setRequiredNFTs(1);

        assert.equal(await priceOracle.countNFTs(ownerAccount), 0);
        assert.equal(await priceOracle.countNFTs(NULL_ADDRESS), 0);
        assert.equal(await priceOracle.countNFTs(someone), 0);
    })
});
