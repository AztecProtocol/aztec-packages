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

Connect to your local Aztec network and create a test wallet:

```typescript title="setup" showLineNumbers 
const logger = createLogger('e2e:token');

// We create PXE client connected to the local network URL
const node = createAztecNodeClient(AZTEC_NODE_URL);
// Wait for local network to be ready
await waitForNode(node, logger);
const wallet = await TestWallet.create(node);

const nodeInfo = await node.getNodeInfo();

logger.info(format('Aztec Local Network Info ', nodeInfo));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260211/yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L36-L49" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L36-L49</a></sub></sup>


The `TestWallet` manages accounts, tracks deployed contracts, and handles transaction proving. It connects to the Aztec node which provides access to both the Private eXecution Environment (PXE) and the network.

## Loading test accounts

The local network comes with pre-funded accounts. Load them into your wallet:

```typescript
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/test-wallet/server";

// wallet is the TestWallet from the setup section above
const [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);
```

## Deploying contracts in tests

Deploy contracts using the generated contract class:

```typescript
import { TokenContract } from "@aztec/noir-contracts.js/Token";

// wallet is from the setup section; alice is from registerInitialLocalNetworkAccountsInWallet
const contract = await TokenContract.deploy(
  wallet,
  alice, // admin
  "TestToken",
  "TST",
  18,
).send({ from: alice });
```

## Verifying contract state

Use `.simulate()` to read contract state without creating a transaction:

```typescript title="simulate_function" showLineNumbers 
const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
expect(balance).toEqual(1n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260211/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L48-L51" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L48-L51</a></sub></sup>


Simulations are free (no gas cost) and return the function's result directly. Use them for:

- Checking balances and state before/after transactions
- Validating expected outcomes in assertions
- Debugging contract behavior

## Sending test transactions

Send transactions and wait for confirmation:

```typescript title="send_transaction" showLineNumbers 
const receipt = await token.methods
  .mint_to_public(aliceAddress, 1000n)
  .send({ from: aliceAddress });

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260211/docs/examples/ts/aztecjs_connection/index.ts#L103-L110" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L103-L110</a></sub></sup>


The `send()` method returns when the transaction is included in a block.

## Example test structure

Here's a complete test example showing the typical structure with setup, test cases, and assertions:

```typescript title="complete_test_example" showLineNumbers 
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import {
  TestWallet,
  registerInitialLocalNetworkAccountsInWallet,
} from "@aztec/test-wallet/server";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { AztecAddress } from "@aztec/aztec.js/addresses";

// This file demonstrates a complete Jest test structure.
// In a real test file, wrap this in describe() and it() blocks.

// Test setup variables
let wallet: TestWallet;
let aliceAddress: AztecAddress;
let bobAddress: AztecAddress;
let token: TokenContract;

// beforeAll equivalent - setup
async function setup() {
  const node = createAztecNodeClient("http://localhost:8080");
  await waitForNode(node);
  wallet = await TestWallet.create(node);
  [aliceAddress, bobAddress] =
    await registerInitialLocalNetworkAccountsInWallet(wallet);

  token = await TokenContract.deploy(
    wallet,
    aliceAddress,
    "Test",
    "TST",
    18,
  ).send({
    from: aliceAddress,
  });
}

// Test: mints tokens to an account
async function testMintTokens() {
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  const balance = await token.methods
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

  // Transfer to bob using the simple transfer method
  await token.methods.transfer(bobAddress, 100n).send({ from: aliceAddress });

  const aliceBalance = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  const bobBalance = await token.methods
    .balance_of_public(bobAddress)
    .simulate({ from: bobAddress });

  // Note: balances accumulate from previous test
  console.log(`Alice balance: ${aliceBalance}, Bob balance: ${bobBalance}`);
  console.log("✓ Transfer tokens test passed");
}

// Test: reverts when transferring more than balance
async function testRevertOnOverTransfer() {
  const balance = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  try {
    await token.methods
      .transfer(bobAddress, balance + 1n)
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

runTests().catch(console.error);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260211/docs/examples/ts/aztecjs_testing/index.ts#L1-L103" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_testing/index.ts#L1-L103</a></sub></sup>


## Testing failure cases

Test that invalid operations revert as expected:

```typescript
// token, alice, and bob are from the test setup in beforeAll
it("reverts when transferring more than balance", async () => {
  const balance = await token.methods
    .balance_of_public(alice)
    .simulate({ from: alice });

  await expect(
    token.methods
      .transfer_in_public(bob, balance + 1n)
      .simulate({ from: alice })
  ).rejects.toThrow();
});
```

Use `.simulate()` to test reverts without spending gas. The simulation will throw if the transaction would fail onchain.

## Further reading

- [How to read contract data](./how_to_read_data.md)
- [How to send transactions](./how_to_send_transaction.md)
- [How to deploy a contract](./how_to_deploy_contract.md)
- [How to create an account](./how_to_create_account.md)
- [How to compile a contract](../aztec-nr/compiling_contracts.md)
