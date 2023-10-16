---
title: Setup and Installation
---

In this step, we’re going to

1. Install prerequisites
2. Create a yarn project to house everything
3. Create a nargo project for our Aztec contract
4. Create a hardhat project for our Ethereum contract(s)
5. Import all the Ethereum contracts we need
6. Create a yarn project that will interact with our contracts on L1 and the sandbox

We recommend going through this setup to fully understand where things live.

However if you’d rather skip this part, our dev-rels repo contains the starter code here.

# Prerequisites

- [node v18+](https://github.com/tj/n)
- [docker](https://docs.docker.com/)
- [Aztec sandbox](https://docs.aztec.network/dev_docs/getting_started/sandbox) - you should have this running before starting the tutorial

```sh
/bin/sh -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

- Nargo

```sh
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | sh
noirup -v #include_noir_version
```

# Create the root project

Our root project will house everything ✨

```sh
mkdir aztec-token-bridge
```

# Create a nargo project

Now inside `aztec-token-bridge` create a new directory called `aztec-contracts`

Inside `aztec-contracts`, create a nargo contract project by running

```sh
mkdir aztec-contracts
cd aztec-contracts
nargo new --contract token_bridge
```

Your structure will look something like this

```
aztec-contracts
└── token_bridge
    ├── Nargo.toml
    ├── src
       ├── main
```

Inside `Nargo.toml` you will need to add some dependencies. Put this at the bottom:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/aztec" }
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/value-note"}
safe_math = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/safe-math"}
```

Inside `src` you will see a `main.nr` file. This is where our main smart contract will go.

We will also be writing some helper functions that should exist elsewhere so we don't overcomplicated our contract. In `src` create two more files - one called `util.nr` and one called `token_interface` - so your dir structure should now look like this:

```
aztec-contracts
└── token_bridge
    ├── Nargo.toml
    ├── src
      ├── main.nr
      ├── token_interface.nr
      ├── util.nr
```

# Create a JS hardhat project

In the root dir `aztec-token-bridge`, create a new directory called `l1-contracts` and run `npx hardhat init` inside of it. Keep hitting enter so you get the default setup (Javascript project)

```sh
mkdir l1-contracts
cd l1-contracts
npx hardhat init
```

Once you have a hardhat project set up, delete the existing contracts and create a `TokenPortal.sol`:

```sh
cd contracts
rm *.sol
touch TokenPortal.sol
```

Now add dependencies that are required. These include interfaces to Aztec Inbox, Outbox and Registry smart contracts, OpenZeppelin contracts, and NomicFoundation.

```sh
yarn add @aztec/l1-contracts @nomicfoundation/hardhat-network-helpers @nomicfoundation/hardhat-chai-matchers @nomiclabs/hardhat-ethers @nomiclabs/hardhat-etherscan @types/chai @types/mocha @typechain/ethers-v5 @typechain/hardhat chai hardhat-gas-reporter solidity-coverage ts-node typechain typescript @openzeppelin/contracts

```

This is what your `l1-contracts` should look like:

```tree
├── README.md
├── artifacts
├── cache
├── contracts
├── hardhat.config.js
├── node_modules
└── package.json
```

We will need to ensure we are using the correct Solidity version. Inside your `hardhat.config.js` update `solidity` version to this:

```json
  solidity: "0.8.20",
```

# Create src yarn project

In this directory, we will write TS code that will interact with our L1 and L2 contracts and run them against the sandbox.

We will use `viem` in this tutorial and `jest` for testing.

Inside the root directory, run

```sh
mkdir src && cd src && yarn init -yp
yarn add @aztec/aztec.js @aztec/noir-contracts @aztec/types @aztec/foundation @aztec/l1-artifacts viem "@types/node@^20.8.2"
yarn add -D jest @jest/globals ts-jest
```

In `package.json`, add:

```json
"type": "module",
"scripts": {
  "test": "NODE_NO_WARNINGS=1 node --experimental-vm-modules $(yarn bin jest)"
}
```

Your `package.json` should look something like this:

```json
{
  "name": "src",
  "version": "1.0.0",
  "main": "index.js",
  "license": "MIT",
  "private": true,
  "type": "module",
  "dependencies": {
    "@aztec/aztec.js": "^0.8.7",
    "@aztec/foundation": "^0.8.7",
    "@aztec/noir-contracts": "^0.8.7",
    "@aztec/types": "^0.8.7",
    "@types/node": "^20.8.2",
    "ethers": "^5.7"
  },
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1"
  },
  "scripts": {
    "test": "NODE_NO_WARNINGS=1 node --experimental-vm-modules $(yarn bin jest)"
  }
}
```

Create a `tsconfig.json` and paste this:

```json
{
  "compilerOptions": {
    "rootDir": "../",
    "outDir": "./dest",
    "target": "es2020",
    "lib": ["dom", "esnext", "es2017.object"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "downlevelIteration": true,
    "inlineSourceMap": true,
    "declarationMap": true,
    "importHelpers": true,
    "resolveJsonModule": true,
    "composite": true,
    "skipLibCheck": true
  },
  "include": [
    "packages/src/**/*",
    "contracts/**/*.json",
    "packages/src/**/*",
    "packages/aztec-contracts/token_bridge/target/*.json"
  ],
  "exclude": ["node_modules", "**/*.spec.ts", "contracts/**/*.ts"],
  "references": []
}
```

The main thing this will allow us to do is to access TS artifacts that we generate later from our test.

Then create a jest config file: `jest.config.json`

```json
{
  "preset": "ts-jest/presets/default-esm",
  "globals": {
    "ts-jest": {
      "useESM": true
    }
  },
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  "testRegex": "./test/.*\\.test\\.ts$",
  "rootDir": "./test"
}
```

You will also need to install some dependencies:

```sh
yarn add --dev typescript @types/jest ts-jest
```

Finally, we will create a test file. Run this in the `src` directory.:

```sh
mkdir test && cd test
touch cross_chain_messaging.test.ts
```

Your `src` dir should look like:

```tree
src
├── node_modules
└── test
    └── cross_chain_messaging.test.ts
├── jest.config.json
├── package.json
```

In the next step, we’ll start writing our L1 smart contract with some logic to deposit tokens to Aztec from L1.
