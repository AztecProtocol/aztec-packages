# Setting up your project

Let's start by setting up a regular Javascript NodeJS project. Feel free to skip this part if you're already familiar with project setup and head directly to connecting to the Sandbox.

## Create a new project

We'll use [`yarn`](https://yarnpkg.com/) for managing our project and dependencies, though you can also use `npm` or your Javascript package manager of choice.

1. Ensure your node version is compatible with the [prerequisites](../../../../getting_started.md#prerequisites)

```sh
node -v
```

and ensure that you are running sandbox version 0.87.9.

```bash
aztec-up 0.87.9
```

2. Create a new folder and initialize a new project.

```sh
mkdir sample-dapp
cd sample-dapp
yarn init -yp
```

3. Add the `aztec.js` and `accounts` libraries as dependencies. Also add `noir-contracts.js` for quick use of example contracts:

```sh
yarn add @aztec/aztec.js@0.87.9 @aztec/accounts@0.87.9 @aztec/noir-contracts.js@0.87.9
```

and yarn config:

```sh
echo "nodeLinker: node-modules" > .yarnrc.yml
```

Then run: `yarn install`
