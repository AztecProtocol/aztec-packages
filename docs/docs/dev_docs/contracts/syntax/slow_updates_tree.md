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
3. **SlowTree.nr Contract**: This is the smart contract we talked about previously.
4. **SlowMap type**: This is a type in the Azetc library that is utilized by the SlowTree contract.

Let’s see how the TokenBlacklist Contract utilizes the SlowMap interface to interact with the SlowTree contract we talked about previously.

## TokenBlacklist Contract

You can find the full code for the TokenBlacklist smart contract [here](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract).

### The SlowMap Interface and Its Integration

The contract first imports the **`SlowMap`** interface:

```rust
use crate::interfaces::SlowMap;
```

The **`SlowMap`** interface allows the contract to interact with its attached SlowTree. It abstracts these functions so they do not have to be implemented in the TokenBlacklist contract.

### Constructor and Initialization of the Slow Updates Tree

The contract's constructor takes the address of the slow updates contract:

```rust
fn constructor(admin: AztecAddress, slow_updates_contract: AztecAddress) {
    let mut slow_note = FieldNote::new(slow_updates_contract.address);
    storage.slow_update.initialize(&mut slow_note, Option::none(), false);
}

```

This initialization sets up the connection between the **`TokenBlacklist`** contract and a previously deployed SlowTree, allowing it to use the SlowMap interface to directly interact with the SlowTree. 

### Private Transfer Function Utilizing the Slow Updates Tree

In the private transfer function, the contract uses the **`SlowMap`** interface to check if a user is blacklisted:

```rust

let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
let from_roles = UserFlags::new(slow.read_at(&mut context, from.address) as u120);
assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
let to_roles = UserFlags::new(slow.read_at(&mut context, to.address) as u120);
assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

```

Here, the contract reads the roles of the sender and recipient from the SlowTree using the **`read_at`** function in the **`SlowMap`**interface. It checks if either party is blacklisted, and if so, the transaction does not go ahead.

## The SlowMap interface

This interface used by the TokenBlackList contract contains multiple functions for interacting with its associated SlowTree. You can find the interface [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-contracts/src/contracts/token_blacklist_contract/src/interfaces.nr).

For example, the `read_at()` function in the interface calls the `read_at()` private function in the SlowTree contract.

## A SlowTree.nr smart contract

The TokenBlacklist contract interacts with this SlowTree contract through the SlowMap interface. Here you can find all the functions included in this SlowTree contract and how it works.

**Global Constants and Storage Structure:**

At the start of the contract, we define global constants like so:

```rust
global TREE_HEIGHT: Field = 254;
global MEMBERSHIP_SIZE: Field = 256; // TREE_HEIGHT + 2
global UPDATE_SIZE: Field = 512; // TREE_HEIGHT * 2 + 4
global EMPTY_ROOT: Field = 5785871043333994658400733180052743689641713274194136017445890613179954325976;

struct Storage {
    trees: Map<SlowMap<TREE_HEIGHT, UPDATE_SIZE>>,
}
```

- `TREE_HEIGHT`, `MEMBERSHIP_SIZE`, and `UPDATE_SIZE` are constants that define the dimensions of the tree and the proof sizes.
- `EMPTY_ROOT` represents the initial state of the tree root.
- The `Storage` struct contains a map of `SlowMap`s that we will talk about more in the next section.

**Constructor and Initialization**

```rust

#[aztec(private)]
fn constructor() {}

#[aztec(public)]
fn initialize() {
    storage.trees.at(context.msg_sender()).initialize(EMPTY_ROOT);
}
```

`The constructor calls the initialize` function that initializes the Slow Update Tree for  `msg_sender` with an empty root, by calling the `initialize` method in the `SlowMap` library.

**Reading and Updating in Public Context**

```rust

#[aztec(public)]
fn read_at_pub(key: Field) -> Field {
    storage.trees.at(context.msg_sender()).read_at(key)
}

#[aztec(public)]
fn update_at_public(p: SlowUpdateProof<TREE_HEIGHT, UPDATE_SIZE>) {
    storage.trees.at(context.msg_sender()).update_at(p);
}

```

- **`read_at_pub`** allows reading a value from the tree in a public context. It works by getting the value at the key that correlates to `msg_sender()` by caling `read_at()` from the `SlowMap` library.
- **`update_at_public`** enables the public update of the tree by calling `update_at()` from the `SlowMap`using a `SlowUpdateProof` This is what a SlowUpdateProof looks like:

```rust
// The slow update proof. Containing two merkle paths
// One for the before and one for the after trees.
// M = 2 * N + 4
struct SlowUpdateProof<N, M> {
  index: Field,
  new_value: Field,
  before: SlowUpdateInner<N>,
  after: SlowUpdateInner<N>,
}
```

**Reading in Private Context**

```rust

#[aztec(private)]
    fn read_at(index: Field) -> Field {
        let fields = pop_capsule();
        let p: MembershipProof<TREE_HEIGHT, MEMBERSHIP_SIZE> = deserialize_membership_proof(fields);
        assert(index == p.index, "Index does not match expected");

        let expected_root = compute_merkle_root(p.value, p.index, p.sibling_path);
        let selector = compute_selector("_assert_current_root(Field,Field)");
        context.call_public_function(context.this_address(),
            selector,
            [context.msg_sender(), expected_root]);

        p.value
    }
```

- **`read_at`** is a private function that retrieves a value at a given index. It utilizes a **`MembershipProof`** to ensure the legitimacy of the read operation. This is what a MembershipProof looks like:

```rust
struct MembershipProof<N, M> {
    index: Field,
    value: Field,
    sibling_path: [Field; N],
}
```

**Updating from private context**

```rust

#[aztec(private)]
fn update_at_private(index: Field, new_value: Field) {
    // ...
    context.call_public_function(context.this_address(),
         selector,
         [
             context.msg_sender(),
             p.index,
             p.new_value,
             before_root,
             after_root,
             new_after_root
         ]);
}

```

- **`update_at_private`** updates a value in the tree privately. It uses **`SlowUpdateProof`** to validate the update before committing it.

**Ensuring Tree Consistency**

```rust
#[aztec(public)]
internal fn _assert_current_root(caller: Field, expected: Field) {
    // ...
}

#[aztec(public)]
internal fn _update(caller: Field, index: Field, new_value: Field, before: Field, after: Field, new_root: Field) {
    // ...
}

```

- **`_assert_current_root`** and **`_update`** are internal functions ensuring the consistency and integrity of the tree, and are called when reading and updating the tree from private state respectively. They are used to verify that the state of the tree before and after an update is as expected.

## The SlowMap data type

Under the hood, Aztec provides a library for the implementation of a slow_updates_tree. Here we will talk about some of the functions that are utilized in the TokenBlacklist contract and associated SlowTree, but you can find the full library [here](https://github.com/AztecProtocol/aztec-nr/tree/master/slow-updates-tree).

### **`read_at`** function

This function is called when the token wants to check that the account has not been blacklisted. 

```rust

pub fn read_at(self: Self, key: Field) -> Field {
    let time = self.context.public.unwrap().timestamp() as u120;
    let leaf = self.read_leaf_at(key);
    if time <= leaf.next_change as u120 {
        leaf.before
    } else {
        leaf.after
    }
}

```

This function reads the current value of a specific key in the tree. It does this through:

1. **Getting the current timestamp**: It first retrieves the current timestamp from the `context`. It then checks whether the current time is before or after the **`next_change`** timestamp of the leaf.
2. **Reading the leaf**: The function calls `read_leaf_at` to get the leaf object associated with the given key. The leaf object contains `before`, `after`, and `next_change` fields.
3. **Determining the current value**: Depending on whether the current time is before or after **`next_change`**, the function returns either the **`before`** or **`after`** value of the leaf. This mechanism allows for the slow update feature of the tree.

### **`read_leaf_at`** function

`read_at()` calls the `read_leaf_at()` function which reads a specific leaf from the tree using a key.

```rust

pub fn read_leaf_at(self: Self, key: Field) -> Leaf {
    let derived_storage_slot = pedersen_hash([self.storage_slot, key]);
    storage_read(derived_storage_slot, deserialize_leaf)
}

```

1. **Deriving the storage slot**: It first derives a storage slot specific to the key using a Pedersen hash. This derivation ensures that each key has a unique and consistent location in storage.
2. Leaf Retrieval: It then reads the leaf data from the storage slot. The leaf data includes `before`, `after`, and `next_change` timestamps, which are used in the `read_at()` function.

## How to integrate a slow updates tree

You can utilize this example to implement a slow updates tree in your own smart contract.

1. Copy the SlowTree.nr example, replace the constants with whatever you like, and deploy it to your sandbox
2. Copy the SlowMap interface for easy interaction with your deployed SlowTree
3. Import the SlowMap interface into your contract

```rust
use crate::interfaces::SlowMap;
```

4. Take the slow_updates_tree address into the constructor (or hardcode it for test purposes)

```rust
fn constructor(slow_updates_contract: AztecAddress) {}
```

5. Store a slow updates tree in both public and private storage

```rust
slow_update: ImmutableSingleton::new(context, 7, FieldNoteMethods),
                public_slow_update: PublicState::new(
                    context,
                    8,
                    AztecAddressSerializationMethods,
                ),
```

6. Store the SlowTree address in private storage as a FieldNote

```rust
let mut slow_note = FieldNote::new(slow_updates_contract.address);
        storage.slow_update.initialize(&mut slow_note, Option::none(), false);
```

7. Store the SlowTree address in public storage and initialize an instance of SlowMap using this address

```rust
storage.public_slow_update.write(slow_updates_contract);
        SlowMap::at(slow_updates_contract).initialize(context);
```

8. Now you can read from private functions:

```rust
let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
```

9. Or from public functions:

```rust
let slow = SlowMap::at(storage.public_slow_update.read());
```

You can also update by using the `update_at_private()` function in the interface.

Learn more by reading [how it works in more detail](../../../concepts/foundation/communication/public_private_calls/slow_updates_tree.md) and checking out the [slow_updates_tree library](https://github.com/AztecProtocol/aztec-nr/blob/master/slow-updates-tree/src/slow_map.nr).