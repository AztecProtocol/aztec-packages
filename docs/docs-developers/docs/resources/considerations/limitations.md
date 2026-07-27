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

- The Aztec stack is unaudited and under active development. See the [Alpha Network](/participate/alpha) page for details on what this means.
- `msg_sender` is leaked by default when making private -> public calls.
  - `self.enqueue(...)` sets `msg_sender` to the private caller's address, which is publicly visible.
  - Use `self.enqueue_incognito(...)` to hide the sender. The called public function must use `maybe_msg_sender()` instead of `msg_sender()` to handle the null sender.
- The initial `msg_sender` is `-1`, which can be problematic for some contracts.
- Some side-effect counts are still visible in a transaction. Note hashes, nullifiers, and private logs are padded to hide their true counts, but the number of public function calls and L2->L1 messages remains visible. Privacy sets to further reduce leakage are still under development.
- A transaction can only emit a limited number of side-effects (notes, nullifiers, logs, L2->L1 messages). See [circuit limitations](#circuit-limitations).
  - We have not settled on the final constants, since we are still in a testing phase. You could find that certain compositions of nested private function calls (for example, call stacks that are dynamic in size, based on runtime data) could accumulate so many side-effects as to exceed transaction limits. Such transactions would then be unprovable. Please open an issue if you encounter this, as it will help us decide on adequate sizes for our constants.
- Not all Noir cryptographic primitives work in public (AVM) functions. Signature verification (ECDSA secp256k1/r1), AES-128, Blake2s, and Blake3 are not supported. See [AVM Cryptographic Compatibility](../../foundational-topics/advanced/circuits/avm_compatibility.md) for details and workarounds.
- There are many features that we still want to implement. Check out GitHub and the forum for details. If you would like a feature, please open an issue on GitHub.

## WARNING

Do not use real, meaningful secrets on Aztec networks. Some privacy features are still in development, including ensuring a secure "zk" property. Since the Aztec stack is still being developed, there are no guarantees that real secrets will remain secret.

## Limitations

There are plans to resolve all of the below.

### It is not audited

None of the Aztec stack is audited. It is being iterated on every day. It will not be audited for quite some time.

### Under-constrained

Some of our more complex circuits are still in development, so they are still under-constrained.

#### What are the consequences?

Sound proofs are really only needed as a protection against malicious behavior, which we are not testing for at this stage.

### Keys and addresses may change in future rollup versions

The key derivation scheme is documented and stable within the current rollup version, but it may change in future rollup upgrades. Applications should not hardcode assumptions about the specific derivation algorithm.

Please open new discussions on [Discourse](https://discourse.aztec.network) or open issues on [GitHub](https://github.com/AztecProtocol/aztec-packages) if you have requirements that are not being met by the current key derivation scheme.

### No privacy-preserving queries to nodes

Ethereum has a notion of a "full node" which keeps up with the blockchain and stores the full chain state. Many users do not wish to run full nodes, so they rely on third-party "full-node-as-a-service" infrastructure providers who service blockchain queries from their users.

This pattern is likely to develop in Aztec as well, except there is a problem: privacy. If a privacy-seeking user makes a query to a third-party full node, that user might leak data about who they are, about their historical network activity, or about their future intentions. One solution to this problem is "always run a full node", but pragmatically, not everyone will. To protect less-advanced users' privacy, research is underway to explore how a privacy-seeking user may request and receive data from a third-party node without revealing what that data is, nor who is making the request.

### Limited private data authentication

The PXE supports a `scopes` parameter that restricts which accounts' notes a function call can access. However, this is caller-specified: the app chooses its own scopes. There is no mandatory, protocol-enforced authorization layer where the PXE denies an app access to another app's private data. A wallet can restrict scope on behalf of the user, but this is not yet standardized or enforced by default.

### No client-side bytecode validation

Public bytecode is validated at the protocol level when contract classes are registered (the Contract Class Registry verifies encoding and commitments). However, the PXE and wallets do not yet validate that the bytecode a user is about to execute matches their stated intentions (function signature and contract address).

#### What are the consequences?

If incorrect or malicious bytecode is executed, it could read private data from another contract and emit it publicly. Client-side bytecode validation is planned to close this gap.

### Insecure hashes

We are planning a full assessment of the protocol's hashes, including rigorous domain separation.

#### What are the consequences?

Collisions and other hash-related attacks might be possible. This is unlikely to cause problems at this early stage, but is a known area of ongoing work.

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

#include_code constants /noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr rust

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
