---
title: "Token Bridge Tutorial"
---

This tutorial goes over how to create the contracts necessary to create a portal (aka token bridge) and how a developer can use it.

In this tutorial, we will go over the components of a token bridge and how to deploy them, as well as show how to bridge tokens publicly from L1 to L2 and back, using aztec.js.

The first half of this page reviews the process and contracts for bridging token from Ethereum (L1) to Aztec (L2). The second half the page (starting with [Running with Aztec.js](#running-with-aztecjs)) goes over writing your own Typescript script for:

- deploying and initializing contracts to L1 and L2
- minting tokens on L1
- sending tokens into the portal on L1
- minting tokens on L2
- sending tokens from L2 back to L1
- withdrawing tokens from the L1 portal

## Components

Bridges in Aztec involve several components across L1 and L2:

- L1 contracts:
  - `ERC20.sol`: An ERC20 contract that represents assets on L1
  - `TokenPortal.sol`: Manages the passing of messages from L1 to L2. It is deployed on L1, is linked to a specific token on L1 and a corresponding contract on L2. The `registry` is used to find the rollup and the corresponding `inbox` and `outbox` contracts.
- L2 contracts:
  - `Token`: Manages the tokens on L2
  - `TokenBridge`: Manages the bridging of tokens between L2 and L1

`TokenPortal.sol` is the contract that manages the passing of messages from L1 to L2. It is deployed on L1, is linked to a specific token on L1 and a corresponding contract on L2. The `registry` is used to find the rollup and the corresponding `inbox` and `outbox` contracts.

## How it works

### Deposit to Aztec

`TokenPortal.sol` passes messages to Aztec both publicly and privately.

This diagram shows the logical flow of information among components involved in depositing to Aztec.

```mermaid
sequenceDiagram
    participant L1 User
    participant L1 TokenPortal
    participant L1 Aztec Inbox
    participant L2 Bridge Contract
    participant L2 Token Contract

    L1 User->>L1 TokenPortal: Deposit Tokens

    Note over L1 TokenPortal: 1. Encode mint message<br/>(recipient + amount)<br/>2. Hash message to field<br/>element (~254 bits)

    L1 TokenPortal->>L1 Aztec Inbox: Send message
    Note over L1 Aztec Inbox: Validates:<br/>1. Recipient Aztec address<br/>2. Aztec version<br/>3. Message content hash<br/>4. Secret hash

    L1 Aztec Inbox-->>L2 Bridge Contract: Forward message
    Note over L2 Bridge Contract: 1. Verify message<br/>2. Process secret<br/>3. Decode mint parameters

    L2 Bridge Contract->>L2 Token Contract: Call mint function
    Note over L2 Token Contract: Mints tokens to<br/>specified recipient
```

Message content that is passed to Aztec is limited to a single field element (~254 bits), so if the message content is larger than that, it is hashed, and the message hash is passed and verified on the receiving contract. There is a utility function in the `Hash` library to hash messages (using `sha256`) to field elements.

The Aztec message Inbox expects a recipient Aztec address that can consume the message (the corresponding L2 bridge contract), the Aztec version (similar to Ethereum's `chainId`), the message content hash (which includes the token recipient and amount in this case), and a `secretHash`, where the corresponding `secret` is used to consume the message on the receiving contract.

So in summary, it deposits tokens to the portal, encodes a mint message, hashes it, and sends it to the Aztec rollup via the Inbox. The L2 token contract can then mint the tokens when the corresponding L2 bridge contract processes the message.

Note that because L1 is public, everyone can inspect and figure out the contentHash and the recipient contract address.

#### `depositToAztecPublic` (TokenPortal.sol)

#include_code deposit_public l1-contracts/test/portals/TokenPortal.sol solidity

#### `depositToAztecPrivate` (TokenPortal.sol)

#include_code deposit_private l1-contracts/test/portals/TokenPortal.sol solidity

**So how do we privately consume the message on Aztec?**

On Aztec, anytime something is consumed (i.e. deleted), we emit a nullifier hash and add it to the nullifier tree. This prevents double-spends. The nullifier hash is a hash of the message that is consumed. So without the secret, one could reverse engineer the expected nullifier hash that might be emitted on L2 upon message consumption. To consume the message on L2, the user provides a secret to the private function, which computes the hash and asserts that it matches to what was provided in the L1->L2 message. This secret is included in the nullifier hash computation and the nullifier is added to the nullifier tree. Anyone inspecting the blockchain won’t know which nullifier hash corresponds to the L1->L2 message consumption.

### Minting on Aztec

The previous code snippets moved funds to the bridge and created a L1->L2 message. Upon building the next rollup block, the sequencer asks the L1 inbox contract for any incoming messages and adds them to the Aztec block's L1->L2 message tree, so an application on L2 can prove that the message exists and can consume it.

This happens inside the `TokenBridge` contract on Aztec.

#include_code claim_public /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

What's happening here?

1. compute the content hash of the message
2. consume the message
3. mint the tokens

:::note

The Aztec `TokenBridge` contract should be an authorized minter in the corresponding Aztec `Token` contract so that it is able to complete mints to the intended recipient.

:::

The token bridge also allows tokens to be withdrawn back to L1 from L2. You can withdraw part of a public or private balance to L1, but the amount and the recipient on L1 will be public.

Sending tokens to L1 involves burning the tokens on L2 and creating a L2->L1 message. The message content is the `amount` to burn, the recipient address, and who can execute the withdraw on the L1 portal on behalf of the user. It can be `0x0` for anyone, or a specified address.

For both the public and private flow, we use the same mechanism to determine the content hash. This is because on L1, things are public anyway. The only difference between the two functions is that in the private domain we have to nullify user’s notes whereas in the public domain we subtract the balance from the user.

#### `exit_to_L1_public` (TokenBridge.nr)

#include_code exit_to_l1_public /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

#### `exit_to_L1_private` (TokenBridge.nr)

This function works very similarly to the public version, except here we burn user’s private notes.

#include_code exit_to_l1_private /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

Since this is a private method, it can't read what token is publicly stored. So instead the user passes a token address, and `_assert_token_is_same()` checks that this user provided address is same as the one in storage.

Because public functions are executed by the sequencer while private methods are executed locally, all public calls are always done _after_ all private calls are completed. So first the burn would happen and only later the sequencer asserts that the token is same. The sequencer just sees a request to `execute_assert_token_is_same` and therefore has no context on what the appropriate private method was. If the assertion fails, then the kernel circuit will fail to create a proof and hence the transaction will be dropped.

A user must sign an approval message to let the contract burn tokens on their behalf. The nonce refers to this approval message.

### Claiming on L1

After the transaction is completed on L2, the portal must call the outbox to successfully transfer funds to the user on L1. Like with deposits, things can be complex here. For example, what happens if the transaction was done on L2 to burn tokens but can’t be withdrawn to L1? Then the funds are lost forever! How do we prevent this?

#include_code token_portal_withdraw /l1-contracts/test/portals/TokenPortal.sol solidity

#### `token_portal_withdraw` (TokenPortal.sol)

Here we reconstruct the L2 to L1 message and check that this message exists on the outbox. If so, we consume it and transfer the funds to the recipient. As part of the reconstruction, the content hash looks similar to what we did in our bridge contract on Aztec where we pass the amount and recipient to the hash. This way a malicious actor can’t change the recipient parameter to the address and withdraw funds to themselves.

We also use a `_withCaller` parameter to determine the appropriate party that can execute this function on behalf of the recipient. If `withCaller` is false, then anyone can call the method and hence we use address(0), otherwise only msg.sender should be able to execute. This address should match the `callerOnL1` address we passed in aztec when withdrawing from L2.

We call this pattern _designed caller_ which enables a new paradigm **where we can construct other such portals that talk to the token portal and therefore create more seamless crosschain legos** between L1 and L2.

## Running with Aztec.js

Let's run through the entire process of depositing, minting and withdrawing tokens in Typescript, so you can see how it works in practice.

### Prerequisites

Same prerequisites as the [getting started guide](../../../../developers/getting_started.md#prerequisites) and the sandbox.

### ProjectSetup

Create a new directory for the tutorial and install the dependencies:

```bash
mkdir token-bridge-tutorial
cd token-bridge-tutorial
yarn init -y
echo "nodeLinker: node-modules" > .yarnrc.yml
yarn add @aztec/aztec.js @aztec/noir-contracts.js @aztec/l1-artifacts @aztec/accounts @aztec/ethereum @aztec/types @types/node typescript@^5.0.4 viem@^2.22.8 tsx
touch tsconfig.json
touch index.ts
```

Add this to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "rootDir": ".",
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
  }
}
```

and add this to your `package.json`:

```json
  // ...
  "type": "module",
  "scripts": {
    "start": "node --import tsx index.ts"
  },
  // ...
```

You can run the script we will build in `index.ts` at any point with `yarn start`.

### Imports

Add the following imports to your `index.ts`:

#include_code imports /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

### Utility functions

Add the following utility functions to your `index.ts` below the imports:

#include_code utils /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

### Sandbox Setup

Start the sandbox with:

```bash
aztec start --sandbox
```

And add the following code to your `index.ts`:

```ts
async function main() {
    #include_code setup /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts raw
}

main();
```

The rest of the code in the tutorial will go inside the `main()` function.

Run the script with `yarn start` and you should see the L1 contract addresses printed out.

### Deploying the contracts

Add the following code to `index.ts` to deploy the L2 token contract:

#include_code deploy-l2-token /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Add the following code to `index.ts` to deploy the L1 token contract and set up the `L1TokenManager` (a utility class to interact with the L1 token contract):

#include_code deploy-l1-token /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Add the following code to `index.ts` to deploy the L1 portal contract:

#include_code deploy-portal /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Add the following code to `index.ts` to deploy the L2 bridge contract:

#include_code deploy-l2-bridge /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Run `yarn start` to confirm that all of the contracts are deployed.

### Setup contracts

Add the following code to `index.ts` to authorize the L2 bridge contract to mint tokens on the L2 token contract:

#include_code authorize-l2-bridge /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Add the following code to `index.ts` to set up the L1 portal contract and `L1TokenPortalManager` (a utility class to interact with the L1 portal contract):

#include_code setup-portal /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

### Bridge tokens

Add the following code to `index.ts` to bridge tokens from L1 to L2:

#include_code l1-bridge-public /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

We have to send two additional transactions because the network must process 2 blocks for the message to be processed by the archiver. We need to progress by 2 because there is a 1 block lag between when the message is sent to Inbox and when the subtree containing the message is included in the block. Then when it's included it becomes available for consumption in the next block.

### Claim on Aztec

Add the following code to `index.ts` to claim the tokens publicly on Aztec:

#include_code claim /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Run `yarn start` to confirm that tokens are claimed on Aztec.

### Withdraw

Add the following code to `index.ts` to start the withdraw the tokens to L1:

#include_code setup-withdrawal /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

We have to send a public authwit to allow the bridge contract to burn tokens on behalf of the user.

Add the following code to `index.ts` to start the withdraw process on Aztec:

#include_code l2-withdraw /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Add the following code to `index.ts` to complete the withdraw process on L1:

#include_code l1-withdraw /yarn-project/end-to-end/src/e2e_token_bridge_tutorial_test.test.ts typescript

Run `yarn start` to run the script and see the entire process in action.
