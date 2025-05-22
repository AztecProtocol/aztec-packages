---
title: Testing Aztec.nr contracts with TypeScript
tags: [contracts, tests]
sidebar_position: 6
---

In this guide we will cover how to interact with your Aztec.nr smart contracts in a testing environment to write automated tests for your apps.

## Prerequisites

- A compiled contract with TS interface (read [how to compile](../smart_contracts/how_to_compile_contract.md))
- Your sandbox running (read [getting started](../../getting_started.md))

## Create TS file and install libraries

Pick where you'd like your tests to live and create a Typescript project.

You will need to install Aztec.js:

```bash
yarn add @aztec/aztecjs
```

You can use `aztec.js` to write assertions about transaction statuses, about chain state both public and private, and about logs.

## Import relevant libraries

Import `aztecjs`. This is an example of some functions and types you might need in your test:

```typescript title="imports" showLineNumbers 
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { type AccountWallet, Fr, type PXE, TxStatus, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L1-L6" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L1-L6</a></sub></sup>


You should also import the [Typescript class you generated](../smart_contracts/how_to_compile_contract.md#typescript-interfaces):

```typescript title="import_contract" showLineNumbers 
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L7-L10" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L7-L10</a></sub></sup>


## Create a PXE client

Currently, testing Aztec.nr smart contracts means testing them against the PXE that runs in the local sandbox. Create a PXE client:

```typescript title="create_pxe_client" showLineNumbers 
const pxe = createPXEClient(PXE_URL);
await waitForPXE(pxe);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L19-L22" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L19-L22</a></sub></sup>


and use the accounts that are initialized with it:

```typescript title="use-existing-wallets" showLineNumbers 
pxe = createPXEClient(PXE_URL);
[owner, recipient] = await getDeployedTestAccountsWallets(pxe);
token = await TokenContract.deploy(owner, owner.getCompleteAddress(), 'TokenName', 'TokenSymbol', 18)
  .send()
  .deployed();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L32-L38" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L32-L38</a></sub></sup>


Alternatively, you can [create a new account.](./create_account.md).

## Write tests

### Calling and sending transactions

You can send transactions within your tests with Aztec.js. Read how to do that in these guides:

- [Simulate a function](./call_view_function.md)
- [Send a transaction](./send_transaction.md)

### Using debug options

You can use the `debug` option in the `wait` method to get more information about the effects of the transaction. This includes information about new note hashes added to the note hash tree, new nullifiers, public data writes, new L2 to L1 messages, new contract information, and newly visible notes.

This debug information will be populated in the transaction receipt. You can log it to the console or use it to make assertions about the transaction.

```typescript title="debug" showLineNumbers 
const tx = await asset.methods.transfer(accounts[1].address, totalBalance).send().wait();
const txEffects = await node.getTxEffect(tx.txHash);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/e2e_token_contract/private_transfer_recursion.test.ts#L25-L28" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_token_contract/private_transfer_recursion.test.ts#L25-L28</a></sub></sup>


You can also log directly from Aztec contracts. Read [this guide](../../reference/debugging/index.md#logging-in-aztecnr) for some more information.

### Examples

#### A private call fails

We can check that a call to a private function would fail by simulating it locally and expecting a rejection. Remember that all private function calls are only executed locally in order to preserve privacy. As an example, we can try transferring more tokens than we have, which will fail an assertion with the `Balance too low` error message.

```typescript title="local-tx-fails" showLineNumbers 
const call = token.methods.transfer(recipient.getAddress(), 200n);
await expect(call.simulate()).rejects.toThrow(/Balance too low/);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L123-L126" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L123-L126</a></sub></sup>


Under the hood, the `send()` method executes a simulation, so we can just call the usual `send().wait()` to catch the same failure.

```typescript title="local-tx-fails" showLineNumbers 
const call = token.methods.transfer(recipient.getAddress(), 200n);
await expect(call.simulate()).rejects.toThrow(/Balance too low/);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L123-L126" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L123-L126</a></sub></sup>


#### A transaction is dropped

We can have private transactions that work fine locally, but are dropped by the sequencer when tried to be included due to a double-spend. In this example, we simulate two different transfers that would succeed individually, but not when both are tried to be mined. Here we need to `send()` the transaction and `wait()` for it to be mined.

```typescript title="tx-dropped" showLineNumbers 
const call1 = token.methods.transfer(recipient.getAddress(), 80n);
const call2 = token.methods.transfer(recipient.getAddress(), 50n);

const provenCall1 = await call1.prove();
const provenCall2 = await call2.prove();

await provenCall1.send().wait();
await expect(provenCall2.send().wait()).rejects.toThrow(/dropped|nullifier/i);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L130-L139" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L130-L139</a></sub></sup>


#### A public call fails locally

Public function calls can be caught failing locally similar to how we catch private function calls. For this example, we use a [`TokenContract` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) instead of a private one.

```typescript title="local-pub-fails" showLineNumbers 
const call = token.methods.transfer_in_public(owner.getAddress(), recipient.getAddress(), 1000n, 0);
await expect(call.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L143-L146" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L143-L146</a></sub></sup>


#### A public call fails on the sequencer

This will submit a failing call to the sequencer, who will include the transaction, but without any side effects from our application logic. Requesting the receipt for the transaction will also show it has a reverted status.

```typescript title="pub-reverted" showLineNumbers 
const call = token.methods.transfer_in_public(owner.getAddress(), recipient.getAddress(), 1000n, 0);
const receipt = await call.send().wait({ dontThrowOnRevert: true });
expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
  TokenContract.storage.public_balances.slot,
  owner.getAddress(),
);
const balance = await pxe.getPublicStorageAt(token.address, ownerPublicBalanceSlot);
expect(balance.value).toEqual(100n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L150-L160" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L150-L160</a></sub></sup>


```
WARN Error processing tx 06dc87c4d64462916ea58426ffcfaf20017880b353c9ec3e0f0ee5fab3ea923f: Assertion failed: Balance too low.
```

### Querying state

We can check private or public state directly rather than going through view-only methods, as we did in the initial example by calling `token.methods.balance().simulate()`.

To query storage directly, you'll need to know the slot you want to access. This can be checked in the [contract's `Storage` definition](../../reference/smart_contract_reference/storage/index.md) directly for most data types. However, when it comes to mapping types, as in most EVM languages, we'll need to calculate the slot for a given key. To do this, we'll use the [`CheatCodes`](../../reference/environment_reference/cheat_codes.md) utility class:

```typescript title="calc-slot" showLineNumbers 
cheats = await CheatCodes.create(ETHEREUM_HOSTS.split(','), pxe);
// The balances mapping is indexed by user address
ownerSlot = await cheats.aztec.computeSlotInMap(TokenContract.storage.balances.slot, ownerAddress);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L74-L78" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L74-L78</a></sub></sup>


#### Querying private state

Private state in the Aztec is represented via sets of [private notes](../../../aztec/concepts/storage/state_model.md#private-state). We can query the Private Execution Environment (PXE) for all notes encrypted for a given user in a contract slot. For example, this gets all notes encrypted for the `owner` user that are stored on the token contract address and on the slot that was calculated earlier. To calculate the actual balance, it extracts the `value` of each note, which is the third element, and sums them up.

```typescript title="private-storage" showLineNumbers 
await token.methods.sync_private_state().simulate();
const notes = await pxe.getNotes({
  recipient: owner.getAddress(),
  contractAddress: token.address,
  storageSlot: ownerSlot,
  scopes: [owner.getAddress()],
});
// TODO(#12694): Do not rely on the ordering of members in a struct / check notes manually
const values = notes.map(note => note.note.items[2]);
const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);
expect(balance).toEqual(100n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L82-L94" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L82-L94</a></sub></sup>


#### Querying public state

Public state behaves as a key-value store, much like in the EVM. We can directly query the target slot and get the result back as a buffer. Note that we use the [`TokenContract` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) in this example, which defines a mapping of public balances on slot 6.

```typescript title="public-storage" showLineNumbers 
await token.methods.mint_to_public(owner.getAddress(), 100n).send().wait();
const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
  TokenContract.storage.public_balances.slot,
  owner.getAddress(),
);
const balance = await pxe.getPublicStorageAt(token.address, ownerPublicBalanceSlot);
expect(balance.value).toEqual(100n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L98-L106" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L98-L106</a></sub></sup>


### Logs

You can check the logs of events emitted by contracts. Contracts in Aztec can emit both encrypted and unencrypted events.

#### Querying public logs

We can query the PXE for the public logs emitted in the block where our transaction is mined.

```typescript title="public-logs" showLineNumbers 
const value = Fr.fromHexString('ef'); // Only 1 bytes will make its way in there :( so no larger stuff
const tx = await testContract.methods.emit_public(value).send().wait();
const filter = {
  fromBlock: tx.blockNumber!,
  limit: 1, // 1 log expected
};
const logs = (await pxe.getPublicLogs(filter)).logs;
expect(logs[0].log.getEmittedFields()).toEqual([value]);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L110-L119" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/dapp_testing.test.ts#L110-L119</a></sub></sup>


## Cheats

The [`CheatCodes`](../../reference/environment_reference/cheat_codes.md) class, which we used for [calculating the storage slot above](#querying-state), also includes a set of cheat methods for modifying the chain state that can be handy for testing.

### Set next block timestamp

Since the rollup time is dependent on what "slot" the block is included in, time can be progressed by progressing slots.
The duration of a slot is available by calling `getSlotDuration()` on the Rollup (code in Rollup.sol).

You can then use the `warp` function on the EthCheatCodes to progress the underlying chain.

<!--#include_code warp /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript-->

## Further reading

- [How to call a view transactions in Aztec.js](./call_view_function.md)
- [How to send a transactions in Aztec.js](./send_transaction.md)
- [How to deploy a contract in Aztec.js](./deploy_contract.md)
- [How to create an account in Aztec.js](./create_account.md)
- [Cheat codes](../../reference/environment_reference/cheat_codes.md)
- [How to compile a contract](../smart_contracts/how_to_compile_contract.md).
