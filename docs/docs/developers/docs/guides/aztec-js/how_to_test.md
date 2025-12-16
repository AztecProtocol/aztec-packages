---
title: Testing Aztec.nr contracts with TypeScript
tags: [contracts, tests]
sidebar_position: 8
description: Learn how to write and run tests for your Aztec.js applications.
---

In this guide we will cover how to interact with your Aztec.nr smart contracts in a testing environment to write automated tests for your apps.

## Prerequisites

- A compiled contract with TS interface (read [how to compile](../smart_contracts/how_to_compile_contract.md))
- Your sandbox running (read [getting started](../../../getting_started_on_sandbox.md))

## Create TS file and install libraries

Pick where you'd like your tests to live and create a Typescript project.

You will need to install Aztec.js:

```bash
yarn add @aztec/aztecjs
```

You can use `aztec.js` to write assertions about transaction statuses, about chain state both public and private, and about logs.

## Import relevant libraries

Import `aztec.js`. This is an example of some functions and types you might need in your test:

```typescript
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress, Fr, type PXE, TxStatus, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
```

You should also import the [Typescript class you generated](../smart_contracts/how_to_compile_contract.md#typescript-interfaces):

```typescript
import { MyTestContract } from './artifacts/MyTestContract';

// assuming you already have a wallet with an account
const contract = MyTestContract.deploy(wallet).send({
  from: testAccount.address,
}).deployed()
```

## Write tests

### Calling and sending transactions

You can send transactions within your tests with Aztec.js. Read how to do that in these guides:

- [Simulate a function](./how_to_simulate_function.md)
- [Send a transaction](./how_to_send_transaction.md)

### Using debug options

You can use the `debug` option in the `wait` method to get more information about the effects of the transaction. This includes information about new note hashes added to the note hash tree, new nullifiers, public data writes, new L2 to L1 messages, new contract information, and newly visible notes.

This debug information will be populated in the transaction receipt. You can log it to the console or use it to make assertions about the transaction.

```typescript
const tx = await contract.methods.my_function(param1, param2)
  .send({ from: senderAddress })
  .wait({ debug: true });

// Access transaction effects for debugging
const txEffects = await pxe.getTxEffect(tx.txHash);
console.log('New note hashes:', txEffects.data.noteHashes);
console.log('New nullifiers:', txEffects.data.nullifiers);
console.log('Public data writes:', txEffects.data.publicDataWrites);
```

You can also log directly from Aztec contracts. Read [this guide](../local_env/how_to_debug.md#in-aztecnr-contracts) for some more information.

## Cheats

The [`CheatCodes`](../../reference/environment_reference/cheat_codes.md) class, which we used for [calculating the storage slot above](#querying-state), also includes a set of cheat methods for modifying the chain state that can be handy for testing.

### Set next block timestamp

Since the rollup time is dependent on what "slot" the block is included in, time can be progressed by progressing slots.
The duration of a slot is available by calling `getSlotDuration()` on the Rollup (code in Rollup.sol).

You can then use the `warp` function on the EthCheatCodes to progress the underlying chain.

```typescript
// Get current slot duration from the rollup contract
const rollup = getRollupContract(ethereumClient);
const slotDuration = await rollup.read.getSlotDuration();

// Progress time by one slot
const ethCheatCodes = new EthCheatCodes(ethereumClient);
await ethCheatCodes.warp(Date.now() / 1000 + slotDuration);
```


### Examples

#### A private call fails

We can check that a call to a private function would fail by simulating it locally and expecting a rejection. Remember that all private function calls are only executed locally in order to preserve privacy. As an example, we can try transferring more tokens than we have, which will fail an assertion with the `Balance too low` error message.

```typescript
const call = token.methods.transfer(recipientAddress, 200n);
await expect(call.simulate({ from: ownerAddress })).rejects.toThrow(/Balance too low/);
```

Under the hood, the `send()` method executes a simulation, so we can just call the usual `send().wait()` to catch the same failure.

```typescript
const call = token.methods.transfer(recipientAddress, 200n);
await expect(call.simulate({ from: ownerAddress })).rejects.toThrow(/Balance too low/);
```

#### A transaction is dropped

We can have private transactions that work fine locally, but are dropped by the sequencer when tried to be included due to an existing nullifier. In this example, we simulate two different transfers that would succeed individually, but not when both are tried to be mined. Here we need to `send()` the transaction and `wait()` for it to be mined.

```typescript
// Create two transfers that would succeed individually
const call1 = token.methods.transfer(recipientAddress, 80n);
const call2 = token.methods.transfer(recipientAddress, 50n);

// Prove both transactions
const provenCall1 = await call1.prove({ from: ownerAddress });
const provenCall2 = await call2.prove({ from: ownerAddress });

// First one succeeds
await provenCall1.send().wait();

// Second one is dropped due to double-spend
await expect(provenCall2.send().wait()).rejects.toThrow(/dropped|nullifier/i);
```

#### A public call fails locally

Public function calls can be caught failing locally similar to how we catch private function calls. For this example, we use a [`TokenContract` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) instead of a private one.

```typescript
const call = token.methods.transfer_in_public(ownerAddress, recipientAddress, 1000n, 0);
await expect(call.simulate({ from: ownerAddress })).rejects.toThrow(/underflow/);
```

#### A public call fails on the sequencer

This will submit a failing call to the sequencer, who will include the transaction, but without any side effects from our application logic. Requesting the receipt for the transaction will also show it has a reverted status.

```typescript
const ethRpcUrl = "http://localhost:8545";

// Set up CheatCodes for testing
const cheats = await CheatCodes.create(ethRpcUrl, pxe);

const call = token.methods.transfer_in_public(ownerAddress, recipientAddress, 1000n, 0);
const receipt = await call.send({ from: ownerAddress }).wait({ dontThrowOnRevert: true });

// Check the transaction was reverted
expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);

// Verify state wasn't modified
const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
  MyTokenContract.storage.public_balances.slot,
  ownerAddress,
);
const balance = await pxe.getPublicStorageAt(token.address, ownerPublicBalanceSlot);
expect(balance.value).toEqual(100n); // Balance unchanged
```

```
WARN Error processing tx 06dc87c4d64462916ea58426ffcfaf20017880b353c9ec3e0f0ee5fab3ea923f: Assertion failed: Balance too low.
```

### Querying state

We can check private or public state directly rather than going through view-only methods, as we did in the initial example by calling `token.methods.balance().simulate()`.

To query storage directly, you'll need to know the slot you want to access. However, when it comes to mapping types, as in most EVM languages, we'll need to calculate the slot for a given key. To do this, we'll use the [`CheatCodes`](../../reference/environment_reference/cheat_codes.md) utility class (see above):

```typescript
const cheats = await CheatCodes.create(ethRpcUrl, pxe);

// Calculate storage slot for a mapping entry
// The balances mapping is indexed by user address
const ownerSlot = await cheats.aztec.computeSlotInMap(
  MyTokenContract.storage.balances.slot,
  ownerAddress
);
```

#### Querying private state

Private state in the Aztec is represented via sets of [private notes](../../concepts/storage/state_model.md#private-state). We can query the Private Execution Environment (PXE) for all notes encrypted for a given user in a contract slot. For example, this gets all notes encrypted for the `owner` user that are stored on the token contract address and on the slot that was calculated earlier. To calculate the actual balance, it extracts the `value` of each note, which is the third element, and sums them up.

```typescript
// Sync private state first
await token.methods.sync_private_state().simulate({ from: ownerAddress });

// Get all notes for the owner
const notes = await pxe.getNotes({
  recipient: ownerAddress,
  contractAddress: token.address,
  storageSlot: ownerSlot,
  scopes: [ownerAddress],
});

// Extract values from notes (assuming value is at index 2)
const values = notes.map(note => note.note.items[2]);
const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);

expect(balance).toEqual(100n);
```

#### Querying public state

Public state behaves as a key-value store, much like in the EVM. We can directly query the target slot and get the result back as a buffer. Note that we use the [`TokenContract` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) in this example, which defines a mapping of public balances on slot 6.

```typescript
// First mint some tokens to public balance
await token.methods.mint_to_public(ownerAddress, 100n)
  .send({ from: ownerAddress })
  .wait();

// Calculate the storage slot for public balances
const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
  MyTokenContract.storage.public_balances.slot,
  ownerAddress,
);

// Read the public storage value
const balance = await pxe.getPublicStorageAt(token.address, ownerPublicBalanceSlot);
expect(balance.value).toEqual(100n);
```

### Logs

You can check the logs of events emitted by contracts. Contracts in Aztec can emit both encrypted and unencrypted events.

#### Querying public logs

We can query the PXE for the public logs emitted in the block where our transaction is mined.

```typescript
// Emit a public event
const value = Fr.fromHexString('0xef');
const tx = await testContract.methods.emit_public(value)
  .send({ from: ownerAddress })
  .wait();

// Query for the logs
const filter = {
  fromBlock: tx.blockNumber!,
  limit: 1, // We expect 1 log
};

const logs = (await pxe.getPublicLogs(filter)).logs;
expect(logs[0].log.getEmittedFields()).toEqual([value]);
```

## Further reading

- [How to simulate functions in Aztec.js](./how_to_simulate_function.md)
- [How to send transactions in Aztec.js](./how_to_send_transaction.md)
- [How to deploy a contract in Aztec.js](./how_to_deploy_contract.md)
- [How to create an account in Aztec.js](./how_to_create_account.md)
- [Cheat codes](../../reference/environment_reference/cheat_codes.md)
- [How to compile a contract](../smart_contracts/how_to_compile_contract.md).
