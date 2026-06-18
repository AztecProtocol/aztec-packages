---
title: Testing Smart Contracts
tags: [contracts, tests]
sidebar_position: 8
description: Learn how to write and run tests for your Aztec smart contracts using Aztec.js and a local network.
---

This guide covers how to test Aztec smart contracts by connecting to a local network, deploying contracts, and verifying their behavior.

## Prerequisites

- A running [local Aztec network](../../getting_started_on_local_network.md)
- A compiled contract artifact (see [How to compile a contract](../aztec-nr/compiling_contracts.md))
- Node.js test framework (Jest, Vitest, or similar)

## Setting up the test environment

Connect to your local Aztec network and create an embedded wallet:

```typescript title="connect_to_network" showLineNumbers 
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);

// Wait for the network to be ready
await waitForNode(node);

// Create an EmbeddedWallet connected to the node
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_connection/index.ts#L1-L14" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L1-L14</a></sub></sup>


The `EmbeddedWallet` manages accounts, tracks deployed contracts, and handles transaction proving. It connects to the Aztec node which provides access to both the Private eXecution Environment (PXE) and the network.

## Loading test accounts

The local network comes with pre-funded accounts. Load them into your wallet:

```typescript title="load_test_accounts" showLineNumbers 
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";

// wallet is the EmbeddedWallet from the setup section above
const [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_testing/index.ts#L117-L122" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_testing/index.ts#L117-L122</a></sub></sup>


## Deploying contracts in tests

Deploy contracts using the generated contract class:

```typescript title="deploy_test_contract" showLineNumbers 
// wallet is from the setup section; alice is from registerInitialLocalNetworkAccountsInWallet
const { contract: testToken } = await TokenContract.deploy(
  wallet,
  alice, // admin
  "TestToken",
  "TST",
  18,
).send({ from: alice });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_testing/index.ts#L124-L133" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_testing/index.ts#L124-L133</a></sub></sup>


## Verifying contract state

Use `.simulate()` to read contract state without creating a transaction:

```typescript title="simulate_function" showLineNumbers 
const { result: balance } = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress });

console.log(`Alice's token balance: ${balance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_connection/index.ts#L148-L154" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L148-L154</a></sub></sup>


Simulations are free (no gas cost) and return the function's result directly. Use them for:

- Checking balances and state before/after transactions
- Validating expected outcomes in assertions
- Debugging contract behavior

## Sending test transactions

Send transactions and wait for confirmation:

```typescript title="send_transaction" showLineNumbers 
const { receipt } = await token.methods
  .mint_to_public(aliceAddress, 1000n)
  .send({ from: aliceAddress });

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_connection/index.ts#L139-L146" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L139-L146</a></sub></sup>


The `send()` method returns when the transaction is included in a block.

## Example test structure

Here's a complete test example showing the typical structure with setup, test cases, and assertions:

```typescript title="complete_test_example" showLineNumbers 
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { AztecAddress } from "@aztec/aztec.js/addresses";

// This file demonstrates a complete Jest test structure.
// In a real test file, wrap this in describe() and it() blocks.

// Test setup variables
let wallet: EmbeddedWallet;
let aliceAddress: AztecAddress;
let bobAddress: AztecAddress;
let token: TokenContract;

// beforeAll equivalent - setup
async function setup() {
  const node = createAztecNodeClient(
    process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
  );
  await waitForNode(node);
  wallet = await EmbeddedWallet.create(node, { ephemeral: true });
  const testAccounts = await getInitialTestAccountsData();
  [aliceAddress, bobAddress] = await Promise.all(
    testAccounts.slice(0, 2).map(async (account) => {
      return (
        await wallet.createSchnorrInitializerlessAccount(
          account.secret,
          account.salt,
          account.signingKey,
        )
      ).address;
    }),
  );

  ({ contract: token } = await TokenContract.deploy(
    wallet,
    aliceAddress,
    "Test",
    "TST",
    18,
  ).send({
    from: aliceAddress,
  }));
}

// Test: mints tokens to an account
async function testMintTokens() {
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  if (balance !== 1000n) {
    throw new Error(`Expected balance 1000n, got ${balance}`);
  }
  console.log("✓ Mint tokens test passed");
}

// Test: transfers tokens between accounts
async function testTransferTokens() {
  // First mint some tokens
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  // Transfer to bob using public transfer
  await token.methods
    .transfer_in_public(aliceAddress, bobAddress, 100n, 0n)
    .send({ from: aliceAddress });

  const { result: aliceBalance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  const { result: bobBalance } = await token.methods
    .balance_of_public(bobAddress)
    .simulate({ from: bobAddress });

  // Note: balances accumulate from previous test
  console.log(`Alice balance: ${aliceBalance}, Bob balance: ${bobBalance}`);
  console.log("✓ Transfer tokens test passed");
}

// Test: reverts when transferring more than balance
async function testRevertOnOverTransfer() {
  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  try {
    await token.methods
      .transfer_in_public(aliceAddress, bobAddress, balance + 1n, 0n)
      .simulate({ from: aliceAddress });
    throw new Error("Expected simulation to throw");
  } catch (error) {
    // Expected to throw
    console.log("✓ Revert on over-transfer test passed");
  }
}

// Run all tests
async function runTests() {
  await setup();
  await testMintTokens();
  await testTransferTokens();
  await testRevertOnOverTransfer();
  console.log("\n✓ All tests passed");
}

await runTests();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_testing/index.ts#L1-L115" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_testing/index.ts#L1-L115</a></sub></sup>


## Testing failure cases

Test that invalid operations revert as expected:

```typescript title="test_revert_case" showLineNumbers 
async function testRevertExample() {
  // testToken and alice are from the deploy/load sections above
  const { result: balance } = await testToken.methods
    .balance_of_public(alice)
    .simulate({ from: alice });

  let reverted = false;
  try {
    await testToken.methods
      .transfer_in_public(alice, bob, balance + 1n, 0n)
      .simulate({ from: alice });
  } catch (error) {
    reverted = true;
  }

  if (!reverted) {
    throw new Error("Expected simulation to revert for over-transfer");
  }
  console.log("✓ Revert on over-transfer test passed");
}

await testRevertExample();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/aztecjs_testing/index.ts#L135-L158" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_testing/index.ts#L135-L158</a></sub></sup>


Use `.simulate()` to test reverts without spending gas. The simulation will throw if the transaction would fail onchain.

## Simulating with overrides

`.simulate()` accepts an `overrides` option that injects values into the simulator's (ephemeral) world-state fork and contract DB before the call runs. The override is scoped to that single simulation and thrown away afterwards.

Override a public-storage slot:

```typescript
const result = await contract.methods.read_balance(account).simulate({
  overrides: {
    publicStorage: [{ contract: contract.address, slot: BALANCE_SLOT, value: new Fr(1_000_000n) }],
  },
});
```

Use this to set up state preconditions, reproduce production bugs against pinned storage, or exercise rare value branches without orchestrating the contract calls that produce them.

### Fast-forwarding a contract update

`fastForwardContractUpdate` returns a `SimulationOverrides` object that simulates a deployed instance as if it had already been upgraded to a new contract class. The new class must already be registered on chain. The cheat mirrors a real `pxe.updateContract` followed by waiting out the upgrade delay: the instance's `currentContractClassId` is bumped, and the `ContractInstanceRegistry`'s delayed-public-mutable storage is rewritten to look like the upgrade was scheduled in the past.

```typescript
import { fastForwardContractUpdate } from '@aztec/aztec.js';

const overrides = await fastForwardContractUpdate({
  instanceAddress: contract.address,
  newClassId: upgradedClass.id,
  node,
});

const result = await contract.methods.upgraded_method().simulate({ overrides });
```

Use this to test code paths that only execute after an upgrade, without orchestrating the full delayed-mutable upgrade flow.

## Further reading

- [How to read contract data](./how_to_read_data.md)
- [How to send transactions](./how_to_send_transaction.md)
- [How to deploy a contract](./how_to_deploy_contract.md)
- [How to create an account](./how_to_create_account.md)
- [How to compile a contract](../aztec-nr/compiling_contracts.md)
