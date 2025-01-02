# Setting up your project

Let's start by setting up a regular Javascript NodeJS project. Feel free to skip this part if you're already familiar with project setup and head directly to connecting to the Sandbox.

## Create a new project

We'll use [`yarn`](https://yarnpkg.com/) for managing our project and dependencies, though you can also use `npm` or your Javascript package manager of choice.

1. Ensure node version is 18 or higher by running.

```sh
node -v
```

2. Create a new folder and initialize a new project.

```sh
mkdir sample-dapp
cd sample-dapp
yarn init -yp
```

3. Add the `aztec.js` and `accounts` libraries as dependencies. Also add `noir-contracts.js` for quick use of example contracts:

```sh
yarn add @aztec/aztec.js @aztec/accounts @aztec/noir-contracts.js
```
