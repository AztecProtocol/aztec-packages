---
title: Setting up Aztec.nr Contracts
---

## Introduction

This guide explains the necessary set up required to write your own contract using the Aztec.nr library and deploy it on the sandbox

:::info Prerequisite reading
If you haven't read [Aztec Sandbox](./sandbox.md) and [Noir](./noir.md), we recommend going there first.
:::

### Dependencies
1. You will need the Noir build tool `nargo`, which you can install via [`noirup`](https://github.com/noir-lang/noirup). Make sure you install the `aztec` version of nargo:

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v aztec
```

2. [Have a running sandbox and a code repo to interact with it](./sandbox.md)

## Set up for aztec.nr contracts
1. Inside the yarn project you created from the [Sandbox](./sandbox.md) page, create a sub-folder where the contracts will reside.
```bash
mkdir contracts
```

All contract projects will reside within this folder.

2. Next, create a noir project using nargo by running the following in the terminal from the `contracts` folder
```bash
cd contracts
nargo new example_contract
```

This creates a noir project with Nargo.toml (which is the manifest file of the project). Also, you will see a file in `example_contract/src/main.nr` which is where we will write our contract. 

Your folder should look like:
```
.
|-contracts
| |--example_contract
| |  |--src
| |  |  |--main.nr
|-src
| |--index.ts
```

But before writing the contracts, we must add the aztec.nr library that adds smart contract syntax to Noir that the aztec sandbox can understand.

3. Build the aztec.nr library on your machine.

For this, clone the `aztec-packages` repository (which is the monorepo where the library resides) and build it anywhere on your machine
```bash
cd path/to/where/you/want/this/package
```

```bash
git clone git@github.com:AztecProtocol/aztec-packages.git
cd aztec-packages
./bootstrap.sh
```
`./boostrap.sh` is a script that builds the package.

4. Add aztec.nr library as a dependency to your noir project. Open Nargo.toml that is in the `contracts/example_contract` folder, and add the dependency section as follows:
```
[package]
name = "example_contract"
authors = [""]
compiler_version = "0.1"
type = "contract"

[dependencies]
aztec = { path = "path/to/aztec-packages/yarn-project/noir-libs/noir-aztec" }
```

You are now ready to write your own contracts! 

You can replace the content of the generated file `example_contract/src/main.nr` with your contract code.

## Next Steps
You can learn more about writing contracts from the [Contracts section](../contracts/main.md). 
For now you can use the [PrivateToken contract example here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-contracts/src/contracts/private_token_contract/src/main.nr)

After writing the contract, you have to compile it. Details can be found [here](../contracts/compiling.md)

After compiling, you can deploy your contract to the Aztec network. Relevant instructions and explainations can be found [here](../contracts/deploying.md)

Thereafter, you can interact with the contracts similar to how it was shown in the the [Creating and submitting transactions section on the Sandbox page](./sandbox.md#creating-and-submitting-transactions).
