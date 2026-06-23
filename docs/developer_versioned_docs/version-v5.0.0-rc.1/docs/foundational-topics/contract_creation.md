---
title: Contract Deployment
sidebar_position: 1
tags: [contracts, protocol]
description: Learn how contract classes and instances are created and deployed on the Aztec network.
---

In the Aztec protocol, contracts are created as _instances_ of contract _classes_. Unlike Ethereum where deployment is binary (deployed or not), Aztec contracts progress through multiple states before they are fully operational.

## Contract Lifecycle Overview

Aztec contracts go through these states:

1. **Contract Class Registration** - Publishing the contract bytecode to the network
2. **Contract Instance Creation** - Computing a deterministic address from class, salt, and initialization parameters
3. **Initialization** - Running the constructor to set up initial state
4. **Public Deployment** - Broadcasting the instance to the network for public function calls
5. **Private Function Broadcasting** - Sharing private function artifacts offchain (optional)

Not every contract needs every state. A private-only contract can skip class registration and public deployment entirely. See the [Contract Deployment Quick Reference](../aztec-nr/contract_readiness_states.md) for a practical guide on which steps your contract needs.

## Contract Classes

A contract class is a collection of state variable declarations, and related private, public and utility functions. Contract classes don't have state, they just define code (storage structure and function logic). A contract class cannot be called; only a contract instance can be called.

### Key Benefits of Contract Classes

Contract classes simplify code reuse by making implementations a first-class citizen in the protocol. With a single class registration, multiple contract instances can be deployed that reference it, reducing deployment costs. Classes also facilitate upgradability by decoupling state from code, making it easier for an instance to switch to different code while retaining its state.

### Structure of a Contract Class

A contract class includes:

- `artifact_hash`: Hash of the contract artifact
- `private_functions_root`: Merkle root of the private functions tree
- `packed_public_bytecode`: Packed bytecode representation of the AVM bytecode for all public functions

The specification of the artifact hash is not enforced by the protocol. It should include commitments to utility functions code and compilation metadata. It is intended to be used by clients to verify that an offchain fetched artifact matches a registered class.

### Contract Class Registration

A contract class is published by calling a private `publish` function in a canonical `ContractClassRegistry` contract, which emits a registration nullifier. This process guarantees that the public bytecode for a contract class is publicly available, which is required for deploying contract instances.

Contract class registration can be skipped if there are no public functions, and the contract will still be usable privately. However, if you have public functions, you must either register the class before deployment or skip public deployment entirely (only private functions will be callable).

## Contract Instances

A deployed contract is effectively an instance of a contract class. It always references a contract class, which determines what code it executes when called. A contract instance has both private and public state, as well as an address that serves as its identifier.

### Structure of a Contract Instance

A contract instance includes:

- `salt`: User-generated pseudorandom value for uniqueness
- `deployer`: Optional address of the contract deployer. Zero for universal deployment
- `contract_class_id`: Identifier of the contract class for this instance
- `initialization_hash`: Hash of the selector and arguments to the constructor
- `immutables_hash`: Hash of the contract's compile-time immutable state
- `public_keys`: Public keys participating in address derivation (nullifier, incoming viewing, outgoing viewing, tagging, message-signing, and fallback keys). Only the incoming viewing key is held as an elliptic curve point; the other five are held as their `hash_public_key` digests.

### Instance Address

The address of a contract instance is computed as the hash of the elements in its structure. This computation is deterministic, allowing users to precompute the expected deployment address of their contract, including account contracts.

### Contract Initialization vs. Public Deployment

Aztec makes an important distinction between initialization and public deployment:

1. **Initialization**: A contract instance is considered initialized once it emits an initialization nullifier, meaning it can only be initialized once. The default state for any address is uninitialized. A user who knows the preimage of the address can still issue a private call into a function in the contract, as long as that function doesn't assert that the contract has been initialized.
2. **Public Deployment**: A contract instance is considered publicly deployed when it has been broadcast to the network via the `publish_for_public_execution` function in the canonical `ContractInstanceRegistry` contract, which emits a deployment nullifier. All public function calls to an undeployed address fail, since the contract class is not known to the network.

### Initialization

Contract constructors are not enshrined in the protocol, but handled at the application circuit level. Constructors are methods used for initializing a contract, either private or public, and contract classes may declare more than a single constructor. They can be declared by the `#[initializer]` macro. You can read more about how to use them on the [defining initializer functions](../aztec-nr/framework-description/functions/how_to_define_functions.md#define-initializer-functions) page.

A contract must ensure:

- It is initialized at most once
- It is initialized using the method and arguments defined in its address preimage
- It is initialized by its deployer (if non-zero)
- Functions dependent on initialization cannot be invoked until the contract is initialized

Functions in a contract may skip the initialization check.

## Verification of Executed Code

When a function is called on a contract instance, the protocol circuits verify that the executed code matches what was registered. For private functions, the circuit checks that the function's verification key hash exists in the `private_functions_root` of the contract class. For public functions, the AVM verifies that the bytecode matches the registered `packed_public_bytecode`. This verification ensures that contracts execute the exact code that was published during class registration.

## Genesis Contracts

The `ContractInstanceRegistry` and `ContractClassRegistry` contracts are protocol contracts that exist from the genesis of the Aztec Network at predefined addresses. They are necessary for deploying other contracts to the network.

## Private Function Broadcasting

Private function artifacts can be shared offchain so others can call your private functions. This is optional—callers who already have the artifacts don't need them broadcast. This step is only necessary when you want external parties to interact with your contract's private functions without having obtained the artifacts through other means.

## Proving Contract States

Your contract can verify the deployment or initialization state of other contracts. This is useful for:

- Ensuring a dependency contract is deployed before interacting
- Access control based on contract state
- Conditional logic based on initialization

```rust
use aztec::history::deployment::{
    assert_contract_bytecode_was_not_published_by,
    assert_contract_bytecode_was_published_by,
    assert_contract_was_initialized_by,
    assert_contract_was_not_initialized_by,
};

// Prove a contract's bytecode was published by a given block
assert_contract_bytecode_was_published_by(block_header, contract_address);

// Prove a contract's bytecode was NOT published by a given block
assert_contract_bytecode_was_not_published_by(block_header, contract_address);

// Prove a contract was initialized by a given block
// (init_hash is the contract's initialization hash, obtainable via get_contract_instance)
assert_contract_was_initialized_by(block_header, contract_address, init_hash);

// Prove a contract was NOT initialized by a given block
assert_contract_was_not_initialized_by(block_header, contract_address, init_hash);
```

These functions prove inclusion or non-inclusion of the corresponding nullifiers in the nullifier tree at a given block.

## Further reading

- [Contract Deployment Quick Reference](../aztec-nr/contract_readiness_states.md) - Practical guide for which deployment steps your contract needs
- [Deploying Contracts](../aztec-js/how_to_deploy_contract.md) - Deploy contracts using TypeScript
- [DApp Development Tutorial](../tutorials/js_tutorials/aztecjs-getting-started.md) - Build a complete application
- [Communicating Cross-Chain](../aztec-nr/framework-description/ethereum_aztec_messaging.md) - Portal contracts and L1/L2 messaging
