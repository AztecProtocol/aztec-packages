---
title: Limitations
description: Understand the current limitations of the Aztec network and its implications for developers.
sidebar_position: 6
---

The Aztec stack is a work in progress. Packages have been released early to gather feedback on the capabilities of the protocol and user experiences.

## What to expect

- Regular breaking changes
- Missing features
- Bugs
- An "unpolished" UX
- Missing information

## Why participate

Front-run the future!

Help shape and define:

- Previously-impossible smart contracts and applications
- Network tooling
- Network standards
- Smart contract syntax
- Educational content
- Core protocol improvements

## Limitations developers need to know about

- It is a testing environment, insecure and unaudited. It is only for testing purposes.
- `msg_sender` is currently leaked when making private -> public calls.
  - The `msg_sender` is always set. If you call a public function from the private world, the `msg_sender` is set to the private caller's address.
  - There are patterns that can mitigate this.
- The initial `msg_sender` is `-1`, which can be problematic for some contracts.
- The number of side-effects attached to a transaction (when sending the transaction to the mempool) is leaky. At this stage of development, this is _intentional_, so that we can gauge appropriate choices for privacy sets. We have clear plans to implement privacy sets so that side effects are much less leaky, and these will be in place for mainnet.
- A transaction can only emit a limited number of side-effects (notes, nullifiers, logs, L2->L1 messages). See [circuit limitations](#circuit-limitations).
  - We have not settled on the final constants, since we are still in a testing phase. You could find that certain compositions of nested private function calls (for example, call stacks that are dynamic in size, based on runtime data) could accumulate so many side-effects as to exceed transaction limits. Such transactions would then be unprovable. Please open an issue if you encounter this, as it will help us decide on adequate sizes for our constants.
- There are many features that we still want to implement. Check out GitHub and the forum for details. If you would like a feature, please open an issue on GitHub.

## WARNING

Do not use real, meaningful secrets in Aztec testnets. Some privacy features are still in development, including ensuring a secure "zk" property. Since the Aztec stack is still being developed, there are no guarantees that real secrets will remain secret.

## Limitations

There are plans to resolve all of the below.

### It is not audited

None of the Aztec stack is audited. It is being iterated on every day. It will not be audited for quite some time.

### Under-constrained

Some of our more complex circuits are still in development, so they are still under-constrained.

#### What are the consequences?

Sound proofs are really only needed as a protection against malicious behavior, which we are not testing for at this stage.

### Keys and addresses are subject to change

The way in which keypairs and addresses are derived is still being iterated on as we receive feedback.

#### What are the consequences?

This will impact the kinds of apps that you can build with the local network as it is today.

Please open new discussions on [Discourse](https://discourse.aztec.network) or open issues on [GitHub](https://github.com/AztecProtocol/aztec-packages) if you have requirements that are not yet being met by the local network's current key derivation scheme.

### No privacy-preserving queries to nodes

Ethereum has a notion of a "full node" which keeps up with the blockchain and stores the full chain state. Many users do not wish to run full nodes, so they rely on third-party "full-node-as-a-service" infrastructure providers who service blockchain queries from their users.

This pattern is likely to develop in Aztec as well, except there is a problem: privacy. If a privacy-seeking user makes a query to a third-party full node, that user might leak data about who they are, about their historical network activity, or about their future intentions. One solution to this problem is "always run a full node", but pragmatically, not everyone will. To protect less-advanced users' privacy, research is underway to explore how a privacy-seeking user may request and receive data from a third-party node without revealing what that data is, nor who is making the request.

### No private data authentication

Private data should not be returned to an app unless the user authorizes such access to the app. An authorization layer is not yet in place.

#### What are the consequences?

Any app can request and receive any private user data relating to any other private app. This sounds problematic, but the local network is a sandbox, and no meaningful value or credentials should be stored there - only test values and test credentials.

An authorization layer will be added in due course.

### No bytecode validation

For safety reasons, bytecode should not be executed unless the PXE (Private eXecution Environment) or wallet has validated that the user's intentions (the function signature and contract address) match the bytecode.

#### What are the consequences?

Without bytecode validation, if incorrect bytecode is executed and that bytecode is malicious, it could read private data from some other contract and emit that private data to the world. This would be problematic in production, but the local network is a sandbox, and no meaningful value or credentials should be stored there - only test values and test credentials.

There are plans to add bytecode validation soon.

### Insecure hashes

We are planning a full assessment of the protocol's hashes, including rigorous domain separation.

#### What are the consequences?

Collisions and other hash-related attacks might be possible in the local network. This would be problematic in production, but it is unlikely to cause problems at this early stage of testing.

### `msg_sender` is leaked when making a private -> public call

There are ongoing discussions [here](https://forum.aztec.network/t/what-is-msg-sender-when-calling-private-public-plus-a-big-foray-into-stealth-addresses/7527) (and some more recent discussions that need to be documented) around how to address this.

### New privacy standards are required

There are many [patterns](../../resources/considerations/privacy_considerations.md) which can leak privacy, even on Aztec. Standards have not been developed yet to encourage best practices when designing private smart contracts.

#### What are the consequences?

For example, until community standards are developed to reduce the uniqueness of ["Tx Fingerprints"](../../resources/considerations/privacy_considerations.md#function-fingerprints-and-tx-fingerprints), app developers might accidentally forfeit some function privacy.

## Smart contract limitations

We will never be done with all the features we want to add to Aztec.nr. We have many features that we still want to implement. Please check out GitHub and open new issues with any feature requests you might have.

## Circuit limitations

### Upper limits on function outputs and transaction outputs

Due to the rigidity of zk-SNARK circuits, there are upper bounds on the amount of computation a circuit can perform, and on the amount of data that can be passed into and out of a function.

> Blockchain developers are no stranger to restrictive computational environments. Ethereum has gas limits, local variable stack limits, call stack limits, contract deployment size limits, log size limits, etc.

Here are the current constants:

```rust title="constants" showLineNumbers 
// TREES RELATED CONSTANTS
pub global ARCHIVE_HEIGHT: u32 = 30; // 4-second blocks for 100 years.
pub global VK_TREE_HEIGHT: u32 = 7;
pub global FUNCTION_TREE_HEIGHT: u32 = 7; // The number of private functions in a contract is therefore 128.
pub global NOTE_HASH_TREE_HEIGHT: u32 = 42; // 64 notes/tx (static because of base rollup insertion), 15tps, for 100 years.
pub global PUBLIC_DATA_TREE_HEIGHT: u32 = 40; // Average of 16 updates/tx (guess), 15tps, 100 years.
pub global NULLIFIER_TREE_HEIGHT: u32 = NOTE_HASH_TREE_HEIGHT;
pub global L1_TO_L2_MSG_TREE_HEIGHT: u32 = 36; // 1024 messages per checkpoint, with 72 seconds per checkpoint, for 100 years.
pub global OUT_HASH_TREE_HEIGHT: u32 = 6; // 48 (AZTEC_MAX_EPOCH_DURATION) checkpoints per epoch, each has 1 out hash.
pub global ARTIFACT_FUNCTION_TREE_MAX_HEIGHT: u32 = FUNCTION_TREE_HEIGHT; // The number of unconstrained functions in a contract. Set to equal the number of private functions in a contract.

pub global NULLIFIER_TREE_ID: Field = 0;
pub global NOTE_HASH_TREE_ID: Field = 1;
pub global PUBLIC_DATA_TREE_ID: Field = 2;
pub global L1_TO_L2_MESSAGE_TREE_ID: Field = 3;
pub global ARCHIVE_TREE_ID: Field = 4;

pub global NOTE_HASH_TREE_LEAF_COUNT: u64 = 1 << (NOTE_HASH_TREE_HEIGHT as u64);
pub global L1_TO_L2_MSG_TREE_LEAF_COUNT: u64 = 1 << (L1_TO_L2_MSG_TREE_HEIGHT as u64);
pub global OUT_HASH_TREE_LEAF_COUNT: u32 = 1 << OUT_HASH_TREE_HEIGHT;

// SUB-TREES RELATED CONSTANTS
pub global NOTE_HASH_SUBTREE_HEIGHT: u32 = 6;
pub global NULLIFIER_SUBTREE_HEIGHT: u32 = 6;
pub global PUBLIC_DATA_SUBTREE_HEIGHT: u32 = 6;
pub global L1_TO_L2_MSG_SUBTREE_HEIGHT: u32 = 10;
pub global NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT;
pub global NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT;
pub global L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT;
// Maximum number of subtrees a L2ToL1Msg unbalanced tree can have. Used when calculating the out hash of a tx.
pub global MAX_L2_TO_L1_MSG_SUBTREES_PER_TX: u32 = 3; // ceil(log2(MAX_L2_TO_L1_MSGS_PER_TX))

// "PER TRANSACTION" CONSTANTS
pub global MAX_NOTE_HASHES_PER_TX: u32 = 1 << NOTE_HASH_SUBTREE_HEIGHT;
pub global MAX_NULLIFIERS_PER_TX: u32 = 1 << NULLIFIER_SUBTREE_HEIGHT;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX: u32 = 16;
pub global MAX_ENQUEUED_CALLS_PER_TX: u32 = 32;
pub global PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 = 1; // This is the fee_payer's fee juice balance.
pub global MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    (1 as u8 << PUBLIC_DATA_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX - PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
pub global MAX_PUBLIC_DATA_READS_PER_TX: u32 = 64;
pub global MAX_L2_TO_L1_MSGS_PER_TX: u32 = 8; // Leave at 8, because it results in sha256 hashing in the Tx Base Rollup
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_TX: u32 = 64;
// Key validation requests are not only for app-siloed _nullifier_ secret keys: app-siloed tagging shared secrets might require this mechanism,
// hence why it's higher than you might expect (roughly (but not quite) enough for a tagging shared secret per private log + 1 nsk).
pub global MAX_KEY_VALIDATION_REQUESTS_PER_TX: u32 = MAX_PRIVATE_LOGS_PER_TX;
pub global MAX_PRIVATE_LOGS_PER_TX: u32 = MAX_NOTE_HASHES_PER_TX;
pub global MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;

// "PER CALL" CONSTANTS
pub global MAX_NOTE_HASHES_PER_CALL: u32 = 16;
pub global MAX_NULLIFIERS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL: u32 = 8;
pub global MAX_ENQUEUED_CALLS_PER_CALL: u32 = MAX_ENQUEUED_CALLS_PER_TX;
pub global MAX_L2_TO_L1_MSGS_PER_CALL: u32 = MAX_L2_TO_L1_MSGS_PER_TX;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_KEY_VALIDATION_REQUESTS_PER_CALL: u32 = MAX_PRIVATE_LOGS_PER_CALL;
pub global MAX_PRIVATE_LOGS_PER_CALL: u32 = MAX_NOTE_HASHES_PER_CALL;
pub global MAX_CONTRACT_CLASS_LOGS_PER_CALL: u32 = 1;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260126/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr#L31-L98" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/constants.nr#L31-L98</a></sub></sup>


#### What are the consequences?

When you write an Aztec.nr function, there will be upper bounds on the following:

- The number of public state reads and writes;
- The number of note reads and nullifications;
- The number of new notes that may be created;
- The number of encrypted logs that may be emitted;
- The number of unencrypted logs that may be emitted;
- The number of L1->L2 messages that may be consumed;
- The number of L2->L1 messages that may be submitted to L1;
- The number of private function calls;
- The number of public function calls that may be enqueued;

Not only are there limits on a _per function_ basis, there are also limits on a _per transaction_ basis.

**In particular, these _per-transaction_ limits will limit transaction call stack depths**. This means if a function call results in a cascade of nested function calls, and each of those function calls outputs many state reads and writes, or logs, then all of that accumulated output data might exceed the per-transaction limits that we currently have. This would cause such transactions to fail.

There are plans to relax some of this rigidity by providing many "sizes" of circuit.

> **In the meantime**, if you encounter a per-transaction limit when testing, please open an issue to explain what you were trying to do - we would love to hear about it. And if you are feeling adventurous, you could modify the PXE to increase the limits. **However**, the limits cannot be increased indefinitely. Although we do anticipate that we will be able to increase them slightly, do not provide yourself with 1 million state transitions per transaction. That would be as unrealistic as artificially increasing Ethereum gas limits to 1 trillion.

## There is more

See the [GitHub issues](https://github.com/AztecProtocol/aztec-packages/issues) for all known bug fixes and features currently being worked on.
