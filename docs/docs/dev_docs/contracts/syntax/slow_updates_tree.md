---
title: Slow Updates Tree
---

Slow Updates Tree is a data structure that allows for public data to be accessed in both private and public domains. Read more about it in the [concepts section](../../../concepts/foundation/communication/public_private_calls/slow_updates_tree.md).

The Slow Updates Tree works by having a current tree and a pending tree, and replacing the current tree with the pending tree after an epoch has passed. Public functions can read directly from the current tree, and private functions can perform a membership proof that values are part of a commitment.

On this page you will learn:

1. The SlowMap data type
2. A SlowTree.nr smart contract
3. The components involved in using the Slow Updates Tree 
4. How you can integrate it into your own smart contract


## Exploring an example integration through a **`TokenBlacklist`** Smart Contract

The `TokenBlacklist` contract is a token contract that does not allow blacklisted accounts to perform mints or transfers. To achieve this, it interacts with a Slow Updates Tree primarily through the `SlowMap` interface. There are four main components involved in this smart contract:

1. **TokenBlacklist.nr Contract:** This is the primary smart contract that utilizes the Slow Updates Tree for managing blacklisted addresses
2. **SlowMap Interface**: This interface is used within the `TokenBlacklist` contract to interact with the Slow Updates Tree. It provides methods for reading and updating values in the tree in both public and private contexts.
3. **SlowTree.nr Contract**: This is a smart contract that instantiates a slow updates tree and allows us to access and manipulate its contents.
4. **SlowMap type**: This is a type in the Azetc library that is utilized by the SlowTree contract.

Let’s see how these components work together to allow private and public functions to read a tree of blacklisted accounts:

## TokenBlacklist Contract

You can find the full code for the TokenBlacklist smart contract [here](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract).

### The SlowMap Interface and Its Integration

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

## The SlowMap interface

This interface used by the TokenBlackList contract contains multiple functions for interacting with its associated SlowTree. You can find the interface [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/interfaces.nr).

For example, the `read_at()` function in the interface calls the `read_at()` private function in the SlowTree contract.

## A SlowTree.nr smart contract

The TokenBlacklist contract interacts with this SlowTree contract through the SlowMap interface. The SlowTree is a contract that utilizes the slow update tree library and instansiates and manipulates a tree. Here you can find some of the functions included in this SlowTree contract and how it works.

**Global Constants and Storage Structure:**

At the start of the contract, we define global constants and storage struct:

#include_code constants_and_storage yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

- `TREE_HEIGHT`, `MEMBERSHIP_SIZE`, and `UPDATE_SIZE` are constants that define the dimensions of the tree and the proof sizes.
- `EMPTY_ROOT` represents the initial state of the tree root.
- The `Storage` struct contains a map of `SlowMap`s that we will talk about more in the next section.

**Initialization**

#include_code initialize yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

An empty Slow Tree is initialized for `msg_sender` by calling the `initialize()` method in the `SlowMap` library.

**Reading and Updating in Public Context**

#include_code read_at_pub yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

#include_code update_at_pub yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

- **`read_at_pub`** allows reading a value from the tree in a public context. It works by getting the value at the key that correlates to `msg_sender()` by caling `read_at()` from the `SlowMap` library.
- **`update_at_public`** enables the public update of the tree by calling `update_at()` from the `SlowMap`using a `SlowUpdateProof` This is what a SlowUpdateProof looks like:

#include_code slow_update_proof yarn-project/aztec-nr/slow-updates-tree/src/slow_map.nr rust

**Reading in Private Context**

#include_code read_at_private yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

- **`read_at`** is a private function that retrieves a value at a given index. It utilizes a **`MembershipProof`** to ensure indexes are the same. This is what a MembershipProof looks like:

#include_code membership_proof yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/types.nr rust

**Updating from private context**

#include_code update_at_private yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

- **`update_at_private()`** updates a value in the tree privately. It uses **`SlowUpdateProof`** to validate the update before committing it.

**Ensuring Tree is Valid**

#include_code assert_current_root yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

#include_code _update yarn-project/noir-contracts/src/contracts/slow_tree_contract/src/main.nr rust

`_assert_current_root` and `_update` are internal functions that ensure the tree is what is expected, and is called when reading & updating the tree from private state respectively. They are used to verify that the state of the tree before and after an update is as expected.

## The SlowMap data type

Under the hood, Aztec provides a library for the implementation of a slow_updates_tree. Here we will talk about some of the functions that are utilized in the TokenBlacklist contract and associated SlowTree, but you can find the full library [here](https://github.com/AztecProtocol/aztec-nr/tree/master/slow-updates-tree).

### **`read_at`** function

This function is called when the token wants to check that the account has not been blacklisted. 

#include_code read_at yarn-project/aztec-nr/slow-updates-tree/src/slow_map.nr rust

This function reads the current value of a specific key in the tree. It does this through:

1. **Getting the current timestamp**: It first retrieves the current timestamp from the `context`. It then checks whether the current time is before or after the **`next_change`** timestamp of the leaf.
2. **Reading the leaf**: The function calls `read_leaf_at` to get the leaf object associated with the given key. The leaf object contains `before`, `after`, and `next_change` fields.
3. **Determining the current value**: Depending on whether the current time is before or after **`next_change`**, the function returns either the **`before`** or **`after`** value of the leaf. This mechanism allows for the slow update feature of the tree.

### **`read_leaf_at`** function

`read_at()` calls the `read_leaf_at()` function which reads a specific leaf from the tree using a key.

#include_code read_leaf_at yarn-project/aztec-nr/slow-updates-tree/src/slow_map.nr rust

1. **Deriving the storage slot**: It first derives a storage slot specific to the key using a Pedersen hash. This derivation ensures that each key has a unique and consistent location in storage.
2. Leaf Retrieval: It then reads the leaf data from the storage slot. The leaf data includes `before`, `after`, and `next_change` timestamps, which are used in the `read_at()` function.

## How to integrate a slow updates tree

You can utilize this example to implement a slow updates tree in your own smart contract.

1. Copy the SlowTree.nr example, replace the constants with whatever you like, and deploy it to your sandbox
2. Copy the SlowMap interface for easy interaction with your deployed SlowTree
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

Learn more by checking out the [slow_updates_tree library](https://github.com/AztecProtocol/aztec-nr/blob/master/slow-updates-tree/src/slow_map.nr).