const { task } = require("hardhat/config")

const formatEther = require("ethers").utils.formatEther;
const AddressZero = require("ethers").constants.AddressZero;
const namehash = require("ethers").utils.namehash;

const register = async (registry, resolver, controller, name, addr) => {
  const exists = await registry.recordExists(namehash(`${name}.bch`));
  if (exists) {
    console.log(`${name} is alredy registered. Skipping.`);
    return;
  }

  console.log(`Registering name ${name} with controller ${controller.address}`);
  const ownerAccount = controller.signer.address;
  const yearInSeconds = 31556952;
  const duration = 1 * yearInSeconds;
  const cost = await controller.rentPrice(name, duration);
  const balance = await controller.signer.provider.getBalance(controller.signer.address);
  console.log(`Registration cost: ${formatEther(cost)} BCH`);
  if (balance.lt(cost)) {
    console.error(`Insufficient funds. Your balance: ${formatEther(balance)} BCH`);
    process.exit();
  }
  const secret = "0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
  const commitment = await controller.makeCommitmentWithConfig(name, ownerAccount, secret, resolver.address, addr);
  await controller.commit(commitment);

  const minCommitmentAge = await controller.minCommitmentAge();
  const timeout = minCommitmentAge.toNumber();
  console.log(`Waiting ${timeout} seconds`);
  await new Promise((resolve) => setTimeout(resolve, (timeout + 0.3) * 1000));
  await controller.registerWithConfig(name, ownerAccount, duration, secret, resolver.address, addr, {value: cost});
  console.log(`Name ${name} registered`);
}

task("register", "Registers an LNS name")
.addParam("name", "Name to register")
.addOptionalParam("address", "SmartBCH address to set to this name", AddressZero)
.setAction(async function ({ name, address }, { ethers: { getNamedSigner } }, runSuper) {
  const registry = await ethers.getContract("ENSRegistryWithFallback");
  const controller = await ethers.getContract("BchRegistrarController");
  const resolver = await ethers.getContract("SmartBchPublicResolver");
  const signer = await getNamedSigner("user");
  await register(registry, resolver, controller.connect(signer), name, address);
})

task("register:list", "Registers a list of LNS names")
.addParam("names", "Comma separated list of names to register")
.setAction(async function ({ names }, { ethers: { getNamedSigner } }, runSuper) {
  names = names.split(',').filter(val => val.length);

  const registry = await ethers.getContract("ENSRegistryWithFallback");
  const controller = await ethers.getContract("BchRegistrarController");
  const resolver = await ethers.getContract("SmartBchPublicResolver");
  const signer = await getNamedSigner("user");

  const yearInSeconds = 31556952;
  const duration = 1 * yearInSeconds;
  let totalCost = ethers.BigNumber.from(0);
  const costs = await Promise.all(names.map(name => controller.rentPrice(name, duration)))
  for (let cost of costs) {
    totalCost = totalCost.add(cost);
  }
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`Total registration cost: ${formatEther(totalCost)} BCH`);
  if (balance.lt(totalCost)) {
    console.error(`Insufficient funds to register all names. Your balance: ${formatEther(balance)} BCH`);
    process.exit();
  }

  for (let name of names) {
    await register(registry, resolver, controller.connect(signer), name, ethers.constants.AddressZero);
  }
})