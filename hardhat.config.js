require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-waffle");
require("hardhat-abi-exporter");
require("@nomiclabs/hardhat-solhint");
require("hardhat-gas-reporter");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

// Load environment variables from .env file. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
require('dotenv').config({silent: true});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

require("./tasks");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

real_accounts = [
  process.env.DEPLOYER_KEY, process.env.OWNER_KEY, process.env.USER_KEY
]

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      // Required for real DNS record tests
      initialDate: "2019-03-15T14:06:45.000+13:00",
      saveDeployments: false,
      tags: ["test", "legacy", "use_root"],
      blockGasLimit: 30000000,
      gasPrice: 50000000000,
      gas: 30000000,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      saveDeployments: false,
      tags: ["test", "legacy", "use_root"],
    },
    // ropsten: {
    //   url: `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`,
    //   tags: ["test", "legacy", "use_root"],
    //   chainId: 3,
    //   accounts: real_accounts,
    // },
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
    //   tags: ["legacy", "use_root"],
    //   chainId: 1,
    //   accounts: real_accounts,
    // },
    // smartbch: {
    //   url: "https://smartbch.fountainhead.cash/mainnet",
    //   accounts: real_accounts,
    //   chainId: 10000,
    //   live: true,
    //   saveDeployments: true,
    //   gasPrice: 1046739556,
    // },
    // "smartbch-amber": {
    //   url: "http://moeing.tech:8545",
    //   accounts: real_accounts,
    //   chainId: 10001,
    //   live: true,
    //   saveDeployments: true,
    //   tags: ["staging"],
    //   gasPrice: 1046739556,
    // },
    // dogechain: {
    //   url: "https://dogechain.ankr.com",
    //   accounts: real_accounts,
    //   chainId: 2000,
    //   live: true,
    //   saveDeployments: true,
    //   gasPrice: 50000000000
    // },
    // "dogechain-testnet": {
    //   url: "https://rpc-testnet.dogechain.dog",
    //   accounts: real_accounts,
    //   chainId: 568,
    //   live: true,
    //   saveDeployments: true,
    //   gasPrice: 50000000000,
    //   tags: ["staging"],
    // }
  },
  mocha: {
    timeout: 600000
  },
  abiExporter: {
    path: './build/contracts',
    clear: true,
    flat: true,
    spacing: 2
  },
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
          }
        }
      }
    ]
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner: {
      default: 1,
    },
    user: {
      default: 2,
    }
  },
};

