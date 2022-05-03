require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-contract-sizer');

const secrets = require('./secrets')

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [
            {
                version: "0.6.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            },
            {
                version: "0.8.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            }
        ]
    },
    networks: {
        hardhat: {
            initialDate: "0001-00-01",
            // allowUnlimitedContractSize: true
        },
        rinkeby: {
            url: secrets.testnetApiUrl,
            accounts: secrets.testnetAccounts
        },
        bsctest: {
            url: secrets.bscTestnetApiUrl,
            accounts: secrets.bscTestnetAccounts
        },
        bscmain: {
            url: secrets.bscMainnetApiUrl,
            accounts: secrets.mainnetAccounts
        },
        ethMain: {
            url: secrets.mainnetApiUrl,
            accounts: secrets.mainnetAccounts
        }
    },
    etherscan: {
        apiKey: secrets.etherscanApiKey
    },
};
