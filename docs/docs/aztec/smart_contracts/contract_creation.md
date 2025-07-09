---
title: Contract Deployment
sidebar_position: 1
tags: [contracts, protocol]
---

In the Aztec protocol, contracts are created as _instances_ of contract _classes_. The deployment process consists of two main steps: first publishing the contract _class_ (if not already published), and then creating a contract _instance_ that references this class.

## Contract Classes

A contract class is a collection of state variable declarations, and related private, public and utility functions. Contract classes don't have state, they just define code (storage structure and function logic). A contract class cannot be called; only a contract instance can be called.

### Key Benefits of Contract Classes

Contract classes simplify code reuse by making implementations a first-class citizen in the protocol. With a single class registration, multiple contract instances can be deployed that reference it, reducing deployment costs. Classes also facilitate upgradability by decoupling state from code, making it easier for an instance to switch to different code while retaining its state.

### Structure of a Contract Class

A contract class includes:

- `artifact_hash`: Hash of the contract artifact
- `private_functions`: List of individual private functions, including constructors
- `packed_public_bytecode`: Packed bytecode representation of the AVM bytecode for all public functions

The specification of the artifact hash is not enforced by the protocol. It should include commitments to utility functions code and compilation metadata. It is intended to be used by clients to verify that an off-chain fetched artifact matches a registered class.

### Contract Class Registration

A contract class is published by calling a private `publish` function in a canonical `ContractClassRegistry` contract, which emits a Registration Nullifier. This process guarantees that the public bytecode for a contract class is publicly available, which is required for deploying contract instances.

Contract class registration can be skipped if there are no public functions in the contract class, and the contract will still be usable privately. However, the contract class must be registered if it contains public functions, as these functions need to be publicly verifiable.

If you have a contract with public functions, you must either register the contract class to deploy or a contract, or skip the public deployment step, in which case only the private functions will be callable.

## Contract Instances

A deployed contract is effectively an instance of a contract class. It always references a contract class, which determines what code it executes when called. A contract instance has both private and public state, as well as an address that serves as its identifier.

### Structure of a Contract Instance

A contract instance includes:

- `version`: Version identifier, initially one
- `salt`: User-generated pseudorandom value for uniqueness
- `deployer`: Optional address of the contract deployer. Zero for universal deployment
- `contract_class_id`: Identifier of the contract class for this instance
- `initialization_hash`: Hash of the selector and arguments to the constructor
- `public_keys_hash`: Optional hash of public keys used for encryption and nullifying

### Instance Address

The address of a contract instance is computed as the hash of the elements in its structure. This computation is deterministic, allowing users to precompute the expected deployment address of their contract, including account contracts.

### Contract Initialization vs. Public Deployment

Aztec makes an important distinction between initialization and public deployment:

1. **Initialization**: A contract instance is considered Initialized once it emits an initialization nullifier, meaning it can only be initialized once. The default state for any address is to be uninitialized. A user who knows the preimage of the address can still issue a private call into a function in the contract, as long as that function doesn't assert that the contract has been initialized.
2. **Public Deployment**: A Contract Instance is considered to be publicly deployed when it has been broadcast to the network via a canonical `ContractInstanceRegistry` contract, which also emits a deployment nullifier. All public function calls to an undeployed address must fail, since the contract class for it is not known to the network.

### Initialization

Contract constructors are not enshrined in the protocol, but handled at the application circuit level. Constructors are methods used for initializing a contract, either private or public, and contract classes may declare more than a single constructor. They can be declared by the `#[initializer]` macro. You can read more about how to use them on the [Defining Initializer Functions](../../developers/guides/smart_contracts/writing_contracts/initializers.md) page.

A contract must ensure:

- It is initialized at most once
- It is initialized using the method and arguments defined in its address preimage
- It is initialized by its deployer (if non-zero)
- Functions dependent on initialization cannot be invoked until the contract is initialized

Functions in a contract may skip the initialization check.

## Verification of Executed Code

The protocol circuits, both private and public, are responsible for verifying that the code loaded for a given function execution matches the expected one. This includes checking that the `contract_class_id` of the called address is the expected one and that the function selector being executed is part of the `contract_class_id`.

## Genesis Contracts

The `ContractInstanceRegistry` and `ContractClassRegistry` contracts exist from the genesis of the Aztec Network, as they are necessary for deploying other contracts to the network. Their nullifiers are pre-inserted into the genesis nullifier tree.

This modular approach to contract deployment creates a flexible system that supports diverse use cases, from public applications to private contract interactions, while maintaining the security and integrity of the Aztec protocol.

## Further reading

To see how to deploy a contract in practice, check out the [dapp development tutorial](../../developers/tutorials/codealong/js_tutorials/simple_dapp/index.md).
