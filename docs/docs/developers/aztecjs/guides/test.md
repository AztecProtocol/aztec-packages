---
title: How to Test Aztec.nr Contracts with Typescript
---

In this guide we will cover how to interact with your Aztec.nr smart contracts in a testing environment to write automated tests for your apps.

To write your first smart contract, check out the [Aztec.nr getting started guide](../../getting_started/aztecnr-getting-started.md).

## Compile your contract and generate TS interface

Once you have written your contract, compile it to create a JSON artifact like this:

```bash
aztec-nargo compile
```

This will compile the contract and create a target folder with JSON artifact inside.

Then with this artifact you can generate a Typescript class:

```bash
aztec-nargo codegen -o src/artifacts target
```

Now your TS class exists in the output directory `src/artifacts`.

## Create TS file and import libraries

Pick where you'd like your tests to live and create a Typescript project. You can do this however you want or paste this command which will create a TS project, install jest, and create a directory for your tests to live.

```bash
mkdir my-e2e-tests && cd my-e2e-tests && yarn init -y && yarn add --dev jest @types/jest ts-jest typescript && npx ts-jest config:init && npx tsc --init && mkdir -p test && echo "module.exports = { preset: 'ts-jest', testEnvironment: 'node' };" > jest.config.js
```

You will also need to install Aztec.js:

```bash
yarn add @aztec/aztecjs 
```

You can use `aztec.js` to write assertions about transaction statuses, about chain state both public and private, and about logs.

## Import relevant libraries

## Run local sandbox and fetch it in your TS

You will need to run your sandbox locally to test against it:

```bash
aztec-sandbox
```

Then you can fetch it in your test:
<!--  TODO include code -->

and use the accounts that are initialized with it:

#include_code use-existing-wallets /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

Alternatively, you can [create a new account.](./create_account.md).

## Write tests

### Calling and sending transactions

You can send transactions within your tests with Aztec.js. Read how to do that in these guides:

* [Call a view (unconstrained) function](./call_view_function.md)
* [Send a transaction](./send_transaction.md)

### Using debug options

You can use the `debug` option in the `wait` method to get more information about the effects of the transaction. This includes information about new note hashes added to the note hash tree, new nullifiers, public data writes, new L2 to L1 messages, new contract information, and newly visible notes.

This debug information will be populated in the transaction receipt. You can log it to the console or use it to make assertions about the transaction.

#include_code debug /yarn-project/end-to-end/src/e2e_token_contract/minting.test.ts typescript

You can also log directly from Aztec contracts. Read [this guide](../debugging/main.md) for some more information.

### Examples

#### A private call fails

We can check that a call to a private function would fail by simulating it locally and expecting a rejection. Remember that all private function calls are only executed locally in order to preserve privacy. As an example, we can try transferring more tokens than we have, which will fail an assertion with the `Balance too low` error message.

#include_code local-tx-fails /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

Under the hood, the `send()` method executes a simulation, so we can just call the usual `send().wait()` to catch the same failure.

#include_code local-tx-fails-send /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

#### A transaction is dropped

We can have private transactions that work fine locally, but are dropped by the sequencer when tried to be included due to a double-spend. In this example, we simulate two different transfers that would succeed individually, but not when both are tried to be mined. Here we need to `send()` the transaction and `wait()` for it to be mined.

#include_code tx-dropped /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

#### A public call fails locally

Public function calls can be caught failing locally similar to how we catch private function calls. For this example, we use a [`TokenContract`](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_contract/src/main.nr) instead of a private one.

:::info
Keep in mind that public function calls behave as in EVM blockchains, in that they are executed by the sequencer and not locally. Local simulation helps alert the user of a potential failure, but the actual execution path of a public function call will depend on when it gets mined.
:::

#include_code local-pub-fails /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

#### A public call fails on the sequencer

We can ignore a local simulation error for a public function via the `skipPublicSimulation`. This will submit a failing call to the sequencer, who will include the transaction, but without any side effects from our application logic. Requesting the receipt for the transaction will also show it has a reverted status.

#include_code pub-reverted /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

```
WARN Error processing tx 06dc87c4d64462916ea58426ffcfaf20017880b353c9ec3e0f0ee5fab3ea923f: Assertion failed: Balance too low.
```

### Querying state

We can check private or public state directly rather than going through view-only methods, as we did in the initial example by calling `token.methods.balance().simulate()`. Bear in mind that directly accessing contract storage will break any kind of encapsulation.

To query storage directly, you'll need to know the slot you want to access. This can be checked in the [contract's `Storage` definition](../contracts/writing_contracts/storage/main.md) directly for most data types. However, when it comes to mapping types, as in most EVM languages, we'll need to calculate the slot for a given key. To do this, we'll use the [`CheatCodes`](../sandbox/references/cheat_codes.md) utility class:

#include_code calc-slot /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

#### Querying private state

Private state in the Aztec Network is represented via sets of [private notes](../../learn/concepts/hybrid_state/main.md#private-state). In our token contract example, the balance of a user is represented as a set of unspent value notes, each with their own corresponding numeric value.

#include_code value-note-def noir-projects/aztec-nr/value-note/src/value_note.nr rust

We can query the Private eXecution Environment (PXE) for all notes encrypted for a given user in a contract slot. For this example, we'll get all notes encrypted for the `owner` user that are stored on the token contract address and on the slot we calculated earlier. To calculate the actual balance, we extract the `value` of each note, which is the first element, and sum them up.

#include_code private-storage /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

#### Querying public state

[Public state](../../learn/concepts/hybrid_state/main.md#public-state) behaves as a key-value store, much like in the EVM. This scenario is much more straightforward, in that we can directly query the target slot and get the result back as a buffer. Note that we use the [`TokenContract`](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_contract/src/main.nr) in this example, which defines a mapping of public balances on slot 6.

#include_code public-storage /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

### Logs

Last but not least, we can check the logs of [events](../contracts/writing_contracts/events/emit_event.md) emitted by our contracts. Contracts in Aztec can emit both [encrypted](../contracts/writing_contracts/events/emit_event.md#encrypted-events) and [unencrypted](../contracts/writing_contracts/events/emit_event.md#unencrypted-events) events.

:::info
At the time of this writing, only unencrypted events can be queried directly. Encrypted events are always assumed to be encrypted notes.
:::

#### Querying unencrypted logs

We can query the PXE for the unencrypted logs emitted in the block where our transaction is mined. Note that logs need to be unrolled and formatted as strings for consumption.

#include_code unencrypted-logs /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

## Cheats

The [`CheatCodes`](../sandbox/references/cheat_codes.md) class, which we used for [calculating the storage slot above](#state), also includes a set of cheat methods for modifying the chain state that can be handy for testing.

### Set next block timestamp

The `warp` method sets the time for next execution, both on L1 and L2. We can test this using an `isTimeEqual` function in a `Test` contract defined like the following:

#include_code is-time-equal noir-projects/noir-contracts/contracts/test_contract/src/main.nr rust

We can then call `warp` and rely on the `isTimeEqual` function to check that the timestamp was properly modified.

#include_code warp /yarn-project/end-to-end/src/guides/dapp_testing.test.ts typescript

:::info
The `warp` method calls `evm_setNextBlockTimestamp` under the hood on L1.
:::
