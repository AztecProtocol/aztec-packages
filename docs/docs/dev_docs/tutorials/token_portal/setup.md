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

```bash
/bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

- Nargo

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v #include_noir_version
```

# Create a yarn project

Our root yarn project will house everything ✨

```bash
mkdir aztec-token-bridge && cd aztec-token-bridge && yarn init
```

In your `package.json` add this

```json
"type": "module",
  "scripts": {
    "build": "yarn clean && tsc -b",
    "build:dev": "tsc -b --watch",
    "clean": "rm -rf ./dest tsconfig.tsbuildinfo",
    "start": "yarn build && node ./dest/src/index.js"
  },
```

Create a `tsconfig.json` and paste this into it:

```json
{
  "compilerOptions": {
    "rootDir": "./packages",
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

# Create a nargo project

Now inside `aztec-token-bridge` create a new directory called `aztec-contracts`

Inside `aztec-contracts`, create a nargo contract project by running

```bash
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

We will also be writing some helper functions that should exist elsewhere so we don't overcomplicated our contract. In `src` create another file called `util.nr` so your dir structure should now look like this:

```
aztec-contracts
└── token_bridge
    ├── Nargo.toml
    ├── src
      ├── main.nr
      ├── util.nr
```

# Create a hardhat project

In the root dir `aztec-token-bridge`, create a new directory called `l1-contracts` and run `npx hardhat init` inside of it. Keep hitting enter so you get the default setup.

```bash
mkdir l1-contracts
cd l1-contracts
npx hardhat init
```

Once you have a hardhat project set up, delete the `contracts` directory inside `l1-contracts`. We will be cloning a new `contracts` dir in the next step.

```bash
rm -rf contracts
```

## Download Ethereum contracts

We will write the `TokenPortal.sol` contract in this tutorial, but it has many imports that we will need to have locally.

To make this easier we have a standalone submodule on GItHub with all the smart contracts with relative paths - [find it in the devrels repo under utils](https://github.com/AztecProtocol/dev-rel/tree/main/utils). You can clone this directly into `l1-contracts` (recommended to then `rm -rf .git` in the `contracts` dir).

<-- TODO(#2453) redirect people to the l1-contracts repo -->

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

And inside `contracts`:

```json
contracts
├── Outbox.sol
├── PortalERC20.sol
└── aztec
    ├── Rollup.sol
    ├── interfaces
    │   ├── IRollup.sol
    │   └── messagebridge
    │       ├── IInbox.sol
    │       ├── IOutbox.sol
    │       └── IRegistry.sol
    ├── libraries
    │   ├── ConstantsGen.sol
    │   ├── DataStructures.sol
    │   ├── Decoder.sol
    │   ├── Errors.sol
    │   ├── Hash.sol
    │   └── MessageBox.sol
    └── mock
        ├── MockVerifier.sol
        └── interfaces
            └── IVerifier.sol
```

# Create src yarn project

In this package, we will write TS code that will interact with our ethereum and aztec-nr contracts and run them against the sandbox.

We will use `viem` instead of `ethers.js` although ethers works fine too! We will also use `jest` to test our code.

Inside the root directory, run

```bash
mkdir src && cd src && yarn init -yp
yarn add @aztec/aztec.js @aztec/noir-contracts @aztec/types viem "@types/node@^20.8.2"
yarn add -D jest @jest/globals ts-jest
```

In `package.json`, add:

```json
"type": "module",
"scripts": {
  "test": "NODE_NO_WARNINGS=1 node --experimental-vm-modules $(yarn bin jest)"
}
```

Your `package.json` should look like so:

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

In this package we will also add a jest config file: `jest.config.json`

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

Finally, we will create a test file, in the `src` package:

```bash
mkdir test && cd test
touch index.test.ts
```

Your `src` package should look like:

```tree
src
├── node_modules
└── test
    └── index.test.ts
├── jest.config.json
├── package.json
```

In the next step, we’ll start writing our L1 smart contract with some logic to deposit tokens to Aztec from L1.
