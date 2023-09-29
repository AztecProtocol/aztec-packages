---
title: Aztec Boxes
---

This page will go over Aztec Boxes, which are full stack Aztec project templates that come with:

- example Aztec.nr contracts
- tests written in Typescript
- web interfaces for interacting with contracts

These can make it easier to set up a new Aztec project and get started building your app as soon as possible.

In this page, we will break down what's included in the "blank" box. This box includes the minimum amount of code to create a full-stack Aztec dapp.

There are also boxes that include a basic React interface (`blank-react`) and another that includes an example token contract along with a React interface (`private-token`). You can see the full list on [Github](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/boxes).

## Setup

See the Quickstart page for [requirements](./quickstart.md#requirements), starting the local [Sandbox environment](./quickstart.md#sandbox-installation) and [installing the CLI](./quickstart#cli-installation).

Aztec Boxes use [yarn](https://classic.yarnpkg.com/) for package management, so if you want to follow along exactly, make sure you have it [installed](https://classic.yarnpkg.com/en/docs/install).

You will also need to install Noir to compile contracts. You can find instructions for installing the latest version of Noir that is compatible with the Sandbox on the [Aztec.nr Contracts](../contracts/main.md#install-noir) page.

## Getting the Box

Once you have everything set up, you can get the plain "blank box" with "unbox" command:

```bash
aztec-cli unbox blank new_project
```

This command indicates that you want to use the "blank" template to create a project in a directory called `new_project`. You can view the source code that is grabbed to create the project [on Github](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/boxes). This source is on the master branch, so it may differ slightly from what you get. The unbox command pulls the code from the latest published version (v0.7.10 at the time of writing) for stability and compatibility reasons.

Running this command will give you the following structure:

```tree
new_project
├── package.json
├── README.md
├── src
│   ├── artifacts
│   │   ├── blank_contract.json
│   │   └── blank.ts
│   ├── contracts
│   │   ├── Nargo.toml
│   │   └── src
│   │       ├── interface.nr
│   │       └── main.nr
│   ├── index.html
│   ├── index.ts
│   └── tests
│       └── blank.contract.test.ts
├── tsconfig.dest.json
├── tsconfig.json
├── webpack.config.js
└── yarn.lock
```

## Run it

Install dependencies by running

```bash
yarn
```

### Start the Sandbox

See the Quickstart for [installing and starting the Sandbox](./quickstart.md#sandbox-installation).

### Start the frontend

Start the frontend with

```bash
yarn start:dev
```

This will serve the web interface at `http://localhost:5173/`.

You should see an interface with two buttons, "Deploy" and "Interact". Clicking these buttons will trigger actions in `./src/index.ts`.

## `index.ts`

### Imports

`index.ts` imports functions and types from `@aztec/aztec.js`, `@aztec/foundation` and the contract ABI from `./artifacts/blank.js`.

The contract ABI (Application Binary Interface) is generated from the contract artifact (a compiled Aztec contract) found at `./src/artifacts/blank_contract.json`.

### Global variables

The Sandbox runs on `localhost:8080` by default. With the `SANDBOX_URL`, we set up an Aztec Private Execution Client (PXE), which provides access to accounts and their private state. The PXE client helps facilitate deployments and interactions (reads and writes) with deployed contracts.

### Deployment

`index.ts` imports from [`@aztec/aztec.js`](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/aztec.js). It also imports the `BlankContractAbi`, which is generated from the contract defined in `./src/contracts/src/main.nr`.

To deploy, it gets one of the pre-initialized wallets that comes with the Sandbox with `getSandboxAccountsWallets`. Using that wallet, the contract ABI, optional salt (used to deterministically calculate the contract address, like [CREATE2 in Ethereum](https://docs.openzeppelin.com/cli/2.8/deploying-with-create2)), and the PXE, we can create a contract deployment transaction and send it to the sandbox network. The constructor defined in the Blank contract doesn't take any arguments, so we pass an empty array.

With the web interface running, open your browser dev tools console, click the "Deploy" button and see the successfully deployed contract address. In the terminal or Docker logs where your sandbox is running, you will see transaction and block production info printed.

### Interaction

Once a contract is deployed, you can interact with it by clicking the "Interact" button. This will call the `getPublicKey` function on the `Blank` contract. For this call we need to pass the contract, the contract abi, the name of the function to call, the arguments for the function, the PXE and the wallet from which to make the transaction, see `callContractFunction`.

### Compiling Contracts

This blank project comes with the contract artifacts, which are generated when the contracts are compiled, out of the box.
