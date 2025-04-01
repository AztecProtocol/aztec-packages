---
title: Contract Deployment
tags: [contracts, protocol]
---

In the Aztec protocol, contracts are deployed as _instances_ of contract _classes_. The deployment process consists of two main steps: first registering the contract _class_ (if not already registered), and then creating a contract _instance_ that references this class.

## Contract Classes

A contract class is a collection of state variable declarations, and related unconstrained, private, and public functions. Contract classes don't have any initialized state, they just define code. A contract class cannot be called; only a contract instance can be called.

### Key Benefits of Contract Classes

Contract classes simplify code reuse by making implementations a first-class citizen in the protocol. When multiple contract instances use the same class, the class needs to be declared only once, reducing deployment costs. Classes also facilitate upgradability by decoupling state from code, making it easier for an instance to switch to different code while retaining its state.

### Structure of a Contract Class

A contract class includes:

- `version`: Version identifier
- `artifact_hash`: Hash of the contract artifact
- `private_functions`: List of individual private functions, including constructors
- `packed_public_bytecode`: Packed bytecode representation of the AVM bytecode for all public functions

### Contract Class Registration

A contract class is registered by calling a private `register` function in a canonical `ContractClassRegisterer` contract, which emits a Registration Nullifier. This process guarantees that the public bytecode for a contract class is publicly available, which is required for deploying contract instances.

## Contract Instances

A contract instance is a concrete deployment of a contract class. It always references a contract class, which determines what code it executes when called. A contract instance has both private and public state, as well as an address that serves as its identifier.

### Structure of a Contract Instance

A contract instance includes:

- `version`: Version identifier, initially one
- `salt`: User-generated pseudorandom value for uniqueness
- `deployer`: Optional address of the contract deployer
- `contract_class_id`: Identifier of the contract class for this instance
- `initialization_hash`: Hash of the selector and arguments to the constructor
- `public_keys_hash`: Optional hash of public keys used for encryption and nullifying

### Instance Address

The address of a contract instance is computed as the hash of the elements in its structure. This computation is deterministic, allowing users to precompute the expected deployment address of their contract, including account contracts.

### Contract Initialization vs. Public Deployment

Aztec makes an important distinction between initialization and public deployment:

1. **Initialization**: A contract instance is considered Initialized once it emits an Initialization Nullifier, meaning it can only be initialized once. The default state for any address is to be uninitialized. A user who knows the preimage of the address can still issue a private call into a function in the contract, as long as that function doesn't assert that the contract has been initialized.

2. **Public Deployment**: A Contract Instance is considered to be Publicly Deployed when it has been broadcasted to the network via a canonical `ContractInstanceDeployer` contract, which also emits a Deployment Nullifier. All public function calls to an Undeployed address must fail, since the Contract Class for it is not known to the network.

### Constructors

Contract constructors are not enshrined in the protocol, but handled at the application circuit level. Constructors are methods used for initializing a contract, either private or public, and a contract may have more than a single constructor.

A contract must ensure:

- It is initialized at most once
- It is initialized using the method and arguments defined in its address preimage
- It is initialized by its deployer (if non-zero)
- Functions dependent on initialization cannot be invoked until the contract is initialized

## Verification of Executed Code

The Kernel Circuit, both private and public, is responsible for verifying that the code loaded for a given function execution matches the expected one. This includes checking that the `contract_class_id` of the called address is the expected one and that the function selector being executed is part of the `contract_class_id`.

## Genesis Contracts

The `ContractInstanceDeployer` and `ContractClassRegisterer` contracts exist from the genesis of the Aztec Network, as they are necessary for deploying other contracts to the network. Their nullifiers are pre-inserted into the genesis nullifier tree.

This modular approach to contract deployment creates a flexible system that supports diverse use cases, from public applications to private contract interactions, while maintaining the security and integrity of the Aztec protocol.

## Further reading

To see how to deploy a contract in practice, check out the [dapp development tutorial](../../developers/tutorials/codealong/js_tutorials/simple_dapp/index.md).
