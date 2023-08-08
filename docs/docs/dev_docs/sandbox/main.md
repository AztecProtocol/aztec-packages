---
title: Aztec Sandbox
---

## Introduction

The Aztec Sandbox aims to provide a complete layer 2 system against which DApp developers can build and deploy contracts in a fast, safe and free environment.

# GETTING STARTED

## What do you need?

- Node.Js >= v18
- Docker and Docker Compose (Docker Desktop under WSL2 on windows)

That's it...

## Ok, so how do I try it out?

Well, you can find instructions here: [https://up.aztec.network].

Or you can just curl the site instead like this:

`/bin/bash -c "$(curl -fsSL https://up.aztec.network)"`

It will download and execute a script invoking docker compose with 2 containers:

- Anvil
- Aztec Sandbox

It will need to create servers on localhost ports 8545 (Anvil) and 8080 (Sandbox) so you will need to ensure nothing conflicts with this.

Within a few seconds the Sandbox should be ready for use!

## Great, but I want to know more about it (or maybe skip this for now if you want to press on..)

Aztec's Layer 2 network is a fully programmable combined private/public ZK rollup. To achieve this, the network contains the following primary components:

- Archiver - Syncs with L1 and maintains a read-only repository of on-L1 state.
- World State - The collection of Merkle Trees.
- P2P - Currently just a locally stored collection of pending transactions.
- Sequencer - Responsible for ordering transactions into the rollup, executing the rollup circuits and publishing blocks.
- Aztec Node - Aggregates the above components and provides a facade to 'clients'.

- Aztec RPC Server - Normally residing with the end client, this decrypts and stores a client's private state, executes simulations and submits transactions to the Aztec Node.
- Aztec.js - Aztec's client library for interacting with the Aztec RPC Server (think Ethers.js).

The sandbox contains all of the above components with the exception of Aztec.js. Aztec.js is what you will use to interact with the sandbox.

With the help of Aztec.js you will be able to:

- Create an account
- Deploy a contract
- Call view methods on contracts
- Simulate the calling of contract functions
- Send transactions to the network
- Be notified when transactions settle

## I have the sandbox running, show me how to use it!

Let's have a complete walkthrough from start to finish. I'm using WSL2 Ubuntu under Windows but the following should work under Linux or MacOS. We will deploy and use a private token contract on our sandbox. Writing the contract itself is out of scope for this tutorial, we will use the ZKToken Contract supplied as one of the example contracts.

Let's create an empty project called `zk-token`. If you are familiar with setting up Typescript projects then you can fast-forward the next couple of steps.

```
phil@LAPTOP-E72241SF:~$ node -v
v18.8.0
phil@LAPTOP-E72241SF:~$ mkdir zk-token
phil@LAPTOP-E72241SF:~$ cd zk-token
phil@LAPTOP-E72241SF:~/zk-token$ yarn init
yarn init v1.22.19
warning ../package.json: No license field
question name (zk-token):
question version (1.0.0):
question description: My first private token
question entry point (index.js):
question repository url:
question author: Phil
question license (MIT):
question private:
success Saved package.json
Done in 16.31s.
phil@LAPTOP-E72241SF:~/zk-token$
phil@LAPTOP-E72241SF:~/zk-token$ mkdir src
```

We use Typescript here at Aztec, so lets add this to the project.

```
phil@LAPTOP-E72241SF:~/zk-token yarn add typescript @types/node --dev
```

Add a `tsconfig.json` into the project root, here is an example:

```
{
  "compilerOptions": {
    "outDir": "dest",
    "rootDir": "src",
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
  "references": [],
  "include": ["src"]
}
```

Add a `scripts` section to `package.json`:

```
{
	"name": "zk-token",
	"version": "1.0.0",
	"description": "My first private token",
	"main": "index.js",
	"author": "Phil",
	"license": "MIT",
	"scripts": {
		"build": "yarn clean && tsc -b",
		"build:dev": "tsc -b --watch",
		"clean": "rm -rf ./dest .tsbuildinfo",
    "start": "yarn build && node ./dest/index.js"
	},
	"devDependencies": {
    "@types/node": "^20.4.8",
		"typescript": "^5.1.6"
	}
}
```

Now we want to install 2 Aztec packages from npm:

```
yarn add @aztec/noir-contracts
yarn add @aztec/aztec.js
```

Create an `index.ts` under the `src` directory:

```
import { createAztecRpcClient, mustSucceedFetch } from '@aztec/aztec.js';

const sandboxUrl = 'http://localhost:8080';

const aztecRpc = createAztecRpcClient(sandboxUrl, mustSucceedFetch);

const nodeInfo = await aztecRpc.getNodeInfo();

console.log('Aztec Sandbox Info ', nodeInfo);
```

Running `yarn start` should give:

```
Aztec Sandbox Info  { version: 1, chainId: 31337 }
```

Great!. The sandbox is running and you are able to interact with it.

The next step is to create some accounts. I won't go into detail about accounts as that is covered here [../../concepts/foundation/accounts/main.md]. But creating an account on the sandbox does 2 things:

1. Deploys an account contract reprepresenting you allowing you to perform actions on the network (deploy contracts, call functions etc).
2. Adds your encryption keys to the RPC Server allowing it to decrypt and manage your private state.
