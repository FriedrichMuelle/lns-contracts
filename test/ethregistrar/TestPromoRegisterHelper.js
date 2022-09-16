const ENS = artifacts.require('./registry/ENSRegistry');
const PublicResolver = artifacts.require('./resolvers/PublicResolver');
const BaseRegistrar = artifacts.require('./NamedBaseRegistrar');
const PromoETHRegistrarController = artifacts.require('./PromoETHRegistrarController');
const PromoRegisterHelper = artifacts.require('./PromoRegisterHelper');
const DummyOracle = artifacts.require('./DummyOracle');
const StablePriceOracle = artifacts.require('./StablePriceOracle');
const { evm, exceptions } = require("../test-utils");
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const namehash = require('eth-ens-namehash');
const { assert } = require("chai");
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;

const DAYS = 24 * 60 * 60;
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000"

contract('PromoETHRegistrarController', function (accounts) {
    let ens;
    let resolver;
    let baseRegistrar;
    let controller;
    let nameWrapper;
    let PromoregisterHelper;

    const ownerAccount = accounts[0]; // Account that owns the registrar
    const someone = accounts[2];

    before(async () => {
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        resolver = await PublicResolver.new(ens.address, nameWrapper.address);

        baseRegistrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), 'eth', {from: ownerAccount});
        await ens.setSubnodeOwner('0x0', sha3('eth'), baseRegistrar.address);

        controller = await PromoETHRegistrarController.new(
            baseRegistrar.address,
            {from: ownerAccount});
        await baseRegistrar.addController(controller.address, {from: ownerAccount});

        PromoregisterHelper = await PromoRegisterHelper.new(ens.address, resolver.address, controller.address);
    });

    it('should not allow other users to register and renew', async () => {
        await exceptions.expectFailure(PromoregisterHelper.register("name", namehash.hash("name.eth"), 86400, someone, someone, {from: someone}));
        await exceptions.expectFailure(PromoregisterHelper.registerMany(["name"], [namehash.hash("name.eth")], [86400], [someone], [someone], {from: someone}));
    });

    it('should register name to contract owner', async () => {
        await PromoregisterHelper.register("name", namehash.hash("name.eth"), 86400, ownerAccount, ownerAccount);
        assert.equal(await web3.eth.getBalance(controller.address), 0);
        assert.equal(await web3.eth.getBalance(PromoregisterHelper.address), 0);

        assert.equal(await ens.owner(namehash.hash("name.eth")), ownerAccount);
        assert.equal(await baseRegistrar.balanceOf(ownerAccount), 1);
    });

    it('should register name to other account', async () => {
        await PromoregisterHelper.register("name2", namehash.hash("name2.eth"), 86400, someone, someone);

        assert.equal(await ens.owner(namehash.hash("name2.eth")), someone);
        assert.equal(await baseRegistrar.balanceOf(someone), 1);
    });

    it('should register many names', async () => {
        const accounts = [
            // name, duration, addr, owner
            ["1", 1 * 31556952, ownerAccount, ownerAccount],
            ["2", 1 * 31556952, someone, someone],
            ["3", 1 * 31556952, NULL_ADDRESS, ownerAccount],
            ["4", 1 * 31556952, NULL_ADDRESS, NULL_ADDRESS],
            ["5", 1 * 31556952, ownerAccount, NULL_ADDRESS],
            ["6", 1 * 31556952, ownerAccount],
        ]

        const ownerBalance = await baseRegistrar.balanceOf(ownerAccount);
        const otherBalance = await baseRegistrar.balanceOf(someone);

        await PromoregisterHelper.registerMany(
            accounts.map(val => val[0]),
            accounts.map(val => namehash.hash(val[0] + ".eth")),
            accounts.map(val => val[1]),
            accounts.map(val => val[2]),
            accounts.map(val => !val[3] || val[3] == NULL_ADDRESS ? ownerAccount : val[3]),
        );

        assert.equal(await web3.eth.getBalance(controller.address), 0);
        assert.equal(await web3.eth.getBalance(PromoregisterHelper.address), 0);

        assert.equal(await baseRegistrar.balanceOf(ownerAccount), ownerBalance.toNumber() + 5);
        assert.equal(await baseRegistrar.balanceOf(someone), otherBalance.toNumber() + 1);

        assert.equal(await ens.owner(namehash.hash("1.eth")), ownerAccount);
        assert.equal(await ens.owner(namehash.hash("2.eth")), someone);
        assert.equal(await ens.owner(namehash.hash("3.eth")), ownerAccount);
        assert.equal(await ens.owner(namehash.hash("4.eth")), ownerAccount);
        assert.equal(await ens.owner(namehash.hash("5.eth")), ownerAccount);
        assert.equal(await ens.owner(namehash.hash("6.eth")), ownerAccount);
    });
});
