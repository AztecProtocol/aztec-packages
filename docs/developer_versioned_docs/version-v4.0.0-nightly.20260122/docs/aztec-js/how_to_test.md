---
title: Testing Smart Contracts
tags: [contracts, tests]
sidebar_position: 8
description: Learn how to write and run tests for your Aztec smart contracts using Aztec.js and a local network.
---

This guide covers how to test Aztec smart contracts by connecting to a local network, deploying contracts, and verifying their behavior.

## Prerequisites

- A running [local Aztec network](../../getting_started_on_local_network.md)
- A compiled contract artifact (see [How to compile a contract](../aztec-nr/how_to_compile_contract.md))
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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260122/yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L36-L49" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L36-L49</a></sub></sup>


The `TestWallet` manages accounts, tracks deployed contracts, and handles transaction proving. It connects to the Aztec node which provides access to both the Private eXecution Environment (PXE) and the network.

## Loading test accounts

The local network comes with pre-funded accounts. Load them into your wallet:

```typescript
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/test-wallet/server";

const [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);
```

## Deploying contracts in tests

Deploy contracts using the generated contract class:

```typescript
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const contract = await TokenContract.deploy(
  wallet,
  alice, // admin
  "TestToken",
  "TST",
  18
)
  .send({ from: alice })
  .deployed();
```

## Verifying contract state

Use `.simulate()` to read contract state without creating a transaction:

```typescript title="simulate_function" showLineNumbers 
const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
expect(balance).toEqual(1n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260122/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L53" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L53</a></sub></sup>


Simulations are free (no gas cost) and return the function's result directly. Use them for:

- Checking balances and state before/after transactions
- Validating expected outcomes in assertions
- Debugging contract behavior

## Sending test transactions

Send transactions and wait for confirmation:

```typescript
await contract.methods
  .transfer(bob, 100n)
  .send({ from: alice })
  .wait();
```

The `.wait()` method blocks until the transaction is included in a block.

## Example test structure

Here's a complete test example using Jest:

```typescript
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import {
  TestWallet,
  registerInitialLocalNetworkAccountsInWallet,
} from "@aztec/test-wallet/server";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

describe("Token contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let bob: AztecAddress;
  let token: TokenContract;

  beforeAll(async () => {
    const node = createAztecNodeClient("http://localhost:8080");
    await waitForNode(node);
    wallet = await TestWallet.create(node);
    [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);

    token = await TokenContract.deploy(wallet, alice, "Test", "TST", 18)
      .send({ from: alice })
      .deployed();
  });

  it("mints tokens to an account", async () => {
    await token.methods.mint_to_public(alice, 1000n).send({ from: alice }).wait();

    const balance = await token.methods
      .balance_of_public(alice)
      .simulate({ from: alice });

    expect(balance).toEqual(1000n);
  });

  it("transfers tokens between accounts", async () => {
    await token.methods.transfer_in_public(bob, 100n).send({ from: alice }).wait();

    const aliceBalance = await token.methods
      .balance_of_public(alice)
      .simulate({ from: alice });
    const bobBalance = await token.methods
      .balance_of_public(bob)
      .simulate({ from: bob });

    expect(aliceBalance).toEqual(900n);
    expect(bobBalance).toEqual(100n);
  });
});
```

## Testing failure cases

Test that invalid operations revert as expected:

```typescript
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
- [How to compile a contract](../aztec-nr/how_to_compile_contract.md)
