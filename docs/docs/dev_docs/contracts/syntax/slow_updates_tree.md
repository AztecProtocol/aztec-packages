---
title: Slow Updates Tree
---

Slow Updates Tree is a data structure that allows for public data to be accessed in both private and public domains. Read the high level overview in the [concepts section](../../../concepts/foundation/communication/public_private_calls/slow_updates_tree.md).

The Slow Updates Tree works by having a current tree and a pending tree, and replacing the current tree with the pending tree after an epoch has passed. Public functions can read directly from the current tree, and private functions can perform a membership proof that values are part of a commitment to the current state of the tree.

On this page you will learn:

1. About the SlowTree.nr smart contract
2. The components involved in using the Slow Updates Tree 
3. How you can integrate it into your own smart contract

Scroll down to view [integration guide](./slow_updates_tree.md#how-to-integrate-a-slow-updates-tree) and [reference](./slow_updates_tree.md#reference).

# Exploring an example integration through a **`TokenBlacklist`** Smart Contract

The `TokenBlacklist` contract is a token contract that does not allow blacklisted accounts to perform mints or transfers. To achieve this, it interacts with a Slow Updates Tree primarily through the `SlowMap` interface. There are four main components involved in this smart contract:

1. **TokenBlacklist.nr Contract:** This is the primary smart contract that utilizes the Slow Updates Tree for managing blacklisted addresses
2. **SlowMap Interface**: This interface is used within the `TokenBlacklist` contract to interact with the Slow Updates Tree. It provides methods for reading and updating values in the tree in both public and private contexts.
3. **SlowTree.nr Contract**: This is a smart contract that instantiates a slow updates tree and allows us to access and manipulate its contents.
4. **SlowMap type**: This is a type in the Azetc library that is utilized by the SlowTree contract.

## TokenBlacklist Contract

You can find the full code for the TokenBlacklist smart contract [here](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract).

### Importing SlowMap

The contract first imports the **`SlowMap`** interface:

#include_code interface yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

The **`SlowMap`** interface allows the contract to interact with its attached SlowTree. It abstracts these functions so they do not have to be implemented in the TokenBlacklist contract.

### Constructor and Initialization of the Slow Updates Tree

The contract's constructor takes the address of the slow updates contract:

#include_code constructor yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

This initialization sets up the connection between the **`TokenBlacklist`** contract and a previously deployed SlowTree, allowing it to use the SlowMap interface to directly interact with the SlowTree. 

### Private Transfer Function Utilizing the Slow Updates Tree

In the private transfer function, the contract uses the **`SlowMap`** interface to check if a user is blacklisted:

#include_code transfer_private yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

Here, the contract reads the roles of the sender and recipient from the SlowTree using the **`read_at`** function in the **`SlowMap`**interface. It checks if either party is blacklisted, and if so, the transaction does not go ahead.

## SlowTree.nr smart contract

Under the hood, this TokenBlacklist contract uses the SlowMap interface to interact with a SlowTree contract. SlowTree.nr is a contract that utilizes the slow update tree library and instansiates and manipulates a tree. 

If you are using the SlowTree contract with the SlowMap interface, the exact implementation details of this smart contract are not required to know. You can read the code [here](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-contracts/src/contracts/slow_tree_contract).

## The SlowMap interface

This interface used by the TokenBlackList contract contains multiple functions for interacting with its associated SlowTree. You can find the interface [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/interfaces.nr).

## The SlowMap type

This is a library provided by Aztec for low-level interacts with a slow updates tree. You can see the code for the library [here](https://github.com/AztecProtocol/aztec-nr/blob/master/slow-updates-tree/src/slow_map.nr).


# How to integrate a slow updates tree

You can use this example to implement a slow updates tree in your own smart contract.

1. Copy the SlowTree.nr example and its dependencies, found [here](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-contracts/src/contracts/slow_tree_contract). Replace the constants with whatever you like and deploy it to your sandbox
2. Copy the SlowMap interface for easy interaction with your deployed SlowTree. Find it [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/interfaces.nr)
3. Import the SlowMap interface into your contract

#include_code interface yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

5. Store a slow updates tree in both public and private storage

#include_code slow_updates_storage yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

6. Store the SlowTree address in private storage as a FieldNote

#include_code constructor yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

7. Store the SlowTree address in public storage and initialize an instance of SlowMap using this address

#include_code write_slow_update_public yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

8. Now you can read and update from private functions:

#include_code get_and_update_private yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

9. Or from public functions:

#include_code get_public yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

# Reference

## Struct `SlowMap`

### Overview
The `SlowMap` struct is used to interact with a slow updates tree deployed via the SlowTree smart contract.

### Fields

| Name    | Type      | Description                     |
|---------|-----------|---------------------------------|
| address | `Field`   | The address of the SlowTree contract |

## Functions

### at

Returns an instance of `SlowMap` at the specified address.

**Parameters**

| Name     | Type           | Description                |
|----------|----------------|----------------------------|
| `address`| `AztecAddress` | The address of the SlowTree |

**Return**

| Name  | Type      | Description                  |
|-------|-----------|------------------------------|
| -     | `SlowMap` | The `SlowMap` instance  |

**Example**

#include_code slowmap_at yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

### initialize

Initializes the `SlowMap`.

**Parameters**

| Name      | Type            | Description          |
|-----------|-----------------|----------------------|
| `context` | `PublicContext` | The execution context |

**Return**

| Name | Type | Description |
|------|------|-------------|
| -    | -    | -           |

**Example**

#include_code slowmap_initialize yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

### read_at_pub

Reads a value at a specified index from a public function.

**Parameters**

| Name      | Type            | Description           |
|-----------|-----------------|-----------------------|
| `context` | `PublicContext` | The execution context |
| `index`   | `Field`         | The index to read at  |

**Return**

| Name     | Type   | Description           |
|----------|--------|-----------------------|
| `result` | `Field`| The value at `index`  |

**Example**

#include_code read_at_pub yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

### read_at

Reads a value at a specified index from a private function.

**Parameters**

| Name      | Type               | Description            |
|-----------|--------------------|------------------------|
| `context` | `PrivateContext`   | The execution context  |
| `index`   | `Field`            | The index to read at   |

**Return**

| Name     | Type   | Description           |
|----------|--------|-----------------------|
| `result` | `Field`| The value at `index`  |

**Example**

#include_code slowmap_read_at yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

### update_at_private

Updates a value at a specified index from a private function. Does not return anything.

**Parameters**

| Name        | Type               | Description            |
|-------------|--------------------|------------------------|
| `context`   | `PrivateContext`   | The execution context  |
| `index`     | `Field`            | The index to update    |
| `new_value` | `Field`            | The new value          |

**Example**

#include_code get_and_update_private yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

## Updating from public

This is not a method in the interface as it can be done using regular Aztec.nr public storage update syntax.

**Example**

#include_code write_slow_update_public yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/main.nr rust

