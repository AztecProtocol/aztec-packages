---
title: Limitations
sidebar_position: 6
---

The Aztec stack is a work in progress. Packages have been released early, to gather feedback on the capabilities of the protocol and user experiences.

## What to expect?

- Regular Breaking Changes;
- Missing features;
- Bugs;
- An 'unpolished' UX;
- Missing information.

## Why participate?

Front-run the future!

Help shape and define:

- Previously-impossible smart contracts and applications
- Network tooling;
- Network standards;
- Smart contract syntax;
- Educational content;
- Core protocol improvements;

## Limitations developers need to know about

- It is a testing environment, it is insecure, and unaudited. It is only for testing purposes.
- `msg_sender` is currently leaking when doing private -> public calls
  - The `msg_sender` will always be set, if you call a public function from the private world, the `msg_sender` will be set to the private caller's address.
  - There are patterns that can mitigate this.
- The initial `msg_sender` is `-1`, which can be problematic for some contracts.
- The number of side-effects attached to a tx (when sending the tx to the mempool) is leaky. At this stage of development, this is _intentional_, so that we can gauge appropriate choices for privacy sets. We have always had clear plans to implement privacy sets so that side effects are much less leaky, and these will be in place come mainnet.
- A transaction can only emit a limited number of side-effects (notes, nullifiers, logs, l2->l1 messages), see [circuit limitations](#circuit-limitations).
  - We haven't settled on the final constants, since we're still in a testing phase. But users could find that certain compositions of nested private function calls (e.g. call stacks that are dynamic in size, based on runtime data) could accumulate so many side-effects as to exceed tx limits. Such txs would then be unprovable. We would love for you to open an issue if you encounter this, as it will help us decide on adequate sizes for our constants.
- There are lots of features that we still want to implement. Checkout github and the forum for details. If you would like a feature, please open an issue on github!

## WARNING

Do not use real, meaningful secrets in Aztec's testnets. Some privacy features are still being worked on, including ensuring a secure "zk" property. Since the Aztec stack is still being worked on, there are no guarantees that real secrets will remain secret.

## Limitations

There are plans to resolve all of the below.

### It is not audited

None of the Aztec stack is audited. It's being iterated-on every day. It will not be audited for quite some time.

### Under-constrained

Some of our more-complex circuits are still being worked on, so they will still be be underconstrained.

#### What are the consequences?

Sound proofs are really only needed as a protection against malicious behavior, which we're not testing for at this stage.

### Keys and Addresses are subject to change

The way in which keypairs and addresses are derived is still being iterated on as we receive feedback.

#### What are the consequences?

This will impact the kinds of apps that you can build with the Sandbox, as it is today:

Please open new discussions on [discourse](http://discourse.aztec.network) or open issues on [github](http://github.com/AztecProtocol/aztec-packages), if you have requirements that aren't-yet being met by the Sandbox's current key derivation scheme.

### No privacy-preserving queries to nodes

Ethereum has a notion of a 'full node' which keeps-up with the blockchain and stores the full chain state. Many users don't wish to run full nodes, so rely on 3rd-party 'full-node-as-a-service' infrastructure providers, who service blockchain queries from their users.

This pattern is likely to develop in Aztec as well, except there's a problem: privacy. If a privacy-seeking user makes a query to a 3rd-party 'full node', that user might leak data about who they are, or about their historical network activity, or about their future intentions. One solution to this problem is "always run a full node", but pragmatically, not everyone will. To protect less-advanced users' privacy, research is underway to explore how a privacy-seeking user may request and receive data from a 3rd-party node without revealing what that data is, nor who is making the request.

### No private data authentication

Private data should not be returned to an app, unless the user authorizes such access to the app. An authorization layer is not-yet in place.

#### What are the consequences?

Any app can request and receive any private user data relating to any other private app. Obviously this sounds bad. But the Sandbox is a sandbox, and no meaningful value or credentials should be stored there; only test values and test credentials.

An auth layer will be added in due course.

### No bytecode validation

For safety reasons, bytecode should not be executed unless the PXE/Wallet has validated that the user's intentions (the function signature and contract address) match the bytecode.

#### What are the consequences?

Without such 'bytecode validation', if the incorrect bytecode is executed, and that bytecode is malicious, it could read private data from some other contract and emit that private data to the world. Obviously this would be bad in production. But the Sandbox is a sandbox, and no meaningful value or credentials should be stored there; only test values and test credentials.

There are plans to add bytecode validation soon.

### Insecure hashes

We are planning a full assessment of the protocol's hashes, including rigorous domain separation.

#### What are the consequences?

Collisions and other hash-related attacks might be possible in the Sandbox. Obviously that would be bad in production. But it's unlikely to cause problems at this early stage of testing.

### `msg_sender` is leaked when making a private -> public call

There are ongoing discussions [here](https://forum.aztec.network/t/what-is-msg-sender-when-calling-private-public-plus-a-big-foray-into-stealth-addresses/7527 (and some more recent discussions that need to be documented) around how to address this.

### New Privacy Standards are required

There are many [patterns](../../reference/considerations/privacy_considerations.md) which can leak privacy, even on Aztec. Standards haven't been developed yet, to encourage best practices when designing private smart contracts.

#### What are the consequences?

For example, until community standards are developed to reduce the uniqueness of ['Tx Fingerprints'](../../reference/considerations/privacy_considerations.md#function-fingerprints-and-tx-fingerprints) app developers might accidentally forfeit some function privacy.

## Smart Contract limitations

We will never be done with all the yummy features we want to add to aztec.nr. We have lots of features that we still want to implement. Please check out github, and please open new issues with any feature requests you might have.

## Circuit limitations

### Upper limits on function outputs and tx outputs

Due to the rigidity of zk-SNARK circuits, there are upper bounds on the amount of computation a circuit can perform, and on the amount of data that can be passed into and out of a function.

> Blockchain developers are no stranger to restrictive computational environments. Ethereum has gas limits, local variable stack limits, call stack limits, contract deployment size limits, log size limits, etc.

Here are the current constants:

```rust title="constants" showLineNumbers 
// "PER CALL" CONSTANTS
pub global MAX_NOTE_HASHES_PER_CALL: u32 = 16;
pub global MAX_NULLIFIERS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL: u32 = 5;
pub global MAX_ENQUEUED_CALLS_PER_CALL: u32 = 16;
pub global MAX_L2_TO_L1_MSGS_PER_CALL: u32 = 2;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL: u32 = 63;
pub global MAX_PUBLIC_DATA_READS_PER_CALL: u32 = 64;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_KEY_VALIDATION_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_LOGS_PER_CALL: u32 = 16;
pub global MAX_PUBLIC_LOGS_PER_CALL: u32 = 4;
pub global MAX_CONTRACT_CLASS_LOGS_PER_CALL: u32 = 1;

// TREES RELATED CONSTANTS
pub global ARCHIVE_HEIGHT: u32 = 29;
pub global VK_TREE_HEIGHT: u32 = 6;
pub global PROTOCOL_CONTRACT_TREE_HEIGHT: u32 = 3;
pub global FUNCTION_TREE_HEIGHT: u32 = 5;
pub global NOTE_HASH_TREE_HEIGHT: u32 = 40;
pub global PUBLIC_DATA_TREE_HEIGHT: u32 = 40;
pub global NULLIFIER_TREE_HEIGHT: u32 = 40;
pub global L1_TO_L2_MSG_TREE_HEIGHT: u32 = 39;
pub global ARTIFACT_FUNCTION_TREE_MAX_HEIGHT: u32 = 5;
pub global NULLIFIER_TREE_ID: Field = 0;
pub global NOTE_HASH_TREE_ID: Field = 1;
pub global PUBLIC_DATA_TREE_ID: Field = 2;
pub global L1_TO_L2_MESSAGE_TREE_ID: Field = 3;
pub global ARCHIVE_TREE_ID: Field = 4;

// SUB-TREES RELATED CONSTANTS
pub global NOTE_HASH_SUBTREE_HEIGHT: u32 = 6;
pub global NULLIFIER_SUBTREE_HEIGHT: u32 = 6;
// Deprecated: to be removed after removal of legacy ts trees
pub global PUBLIC_DATA_SUBTREE_HEIGHT: u32 = 6;
pub global L1_TO_L2_MSG_SUBTREE_HEIGHT: u32 = 4;
pub global NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT;
pub global NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT;
pub global L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT;

// "PER TRANSACTION" CONSTANTS
pub global MAX_NOTE_HASHES_PER_TX: u32 = (1 as u8 << NOTE_HASH_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_NULLIFIERS_PER_TX: u32 = (1 as u8 << NULLIFIER_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX: u32 = 8;
pub global MAX_ENQUEUED_CALLS_PER_TX: u32 = 32;
pub global PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 = 1;
pub global MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    (1 as u8 << PUBLIC_DATA_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX - PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
pub global MAX_PUBLIC_DATA_READS_PER_TX: u32 = 64;
pub global MAX_L2_TO_L1_MSGS_PER_TX: u32 = 8;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX: u32 = 64;
// TODO: for large multisends we might run out of key validation requests here but not dealing with this now as
// databus will hopefully make the issue go away.
pub global MAX_KEY_VALIDATION_REQUESTS_PER_TX: u32 = 64;
pub global MAX_PRIVATE_LOGS_PER_TX: u32 = 32;
pub global MAX_PUBLIC_LOGS_PER_TX: u32 = 8;
pub global MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr#L28-L97" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/constants.nr#L28-L97</a></sub></sup>


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

**In particular, these _per-transaction_ limits will limit transaction call stack depths**. That means if a function call results in a cascade of nested function calls, and each of those function calls outputs lots of state reads and writes, or logs (etc.), then all of that accumulated output data might exceed the per-transaction limits that we currently have. This would cause such transactions to fail.

There are plans to relax some of this rigidity, by providing many 'sizes' of circuit.

> **In the mean time**, if you encounter a per-transaction limit when testing, please do open an issue to explain what you were trying to do; we'd love to hear about it. And if you're feeling adventurous, you could 'hack' the PXE to increase the limits. **However**, the limits cannot be increased indefinitely. So although we do anticipate that we'll be able to increase them a little bit, don't go mad and provide yourself with 1 million state transitions per transaction. That would be as unrealistic as artificially increasing Ethereum gas limits to 1 trillion.

## There's more

See the [GitHub issues (GitHub link)](https://github.com/AztecProtocol/aztec-packages/issues) for all known bugs fixes and features currently being worked on.
