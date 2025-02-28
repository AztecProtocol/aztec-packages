---
title: Data Transmission in Aztec Protocol
sidebar_position: 6
tags: [data, capsules, authwits, args packing, databus]
---

# Data Transmission in Aztec Protocol

Aztec Protocol provides several mechanisms for transmitting data between contracts and within transactions. This documentation explains the main methods of data transmission and when to use them.

## Overview of Data Transmission Methods

Aztec Protocol offers the following main mechanisms for data transmission:

1. **Capsules** - local data storage for contracts
2. **AuthWits (Authentication Witnesses)** - action authorization mechanism
3. **Args Packing** - efficient function argument transmission
4. **DataBus** - optimization for efficient recursion

Let's examine each of these mechanisms in more detail.

## Capsules

Capsules are a local data storage for contracts that allows storing and retrieving arbitrary data. Capsules are bound to a specific contract and storage slot.

### Key Characteristics of Capsules

- **Local Storage**: data is stored locally in the PXE (Private eXecution Environment)
- **Scope**: data is only accessible to the contract that created it
- **Persistence**: data persists until explicitly deleted
- **Arbitrary Data**: can store any data that implements the `Serialize` and `Deserialize` interfaces

### Main Functions for Working with Capsules

- `store<T, N>` - stores data in a slot, overwriting any existing data
- `load<T, N>` - retrieves previously stored data from a slot
- `delete` - deletes data from a slot
- `copy` - efficiently copies contiguous entries between slots

### Example of Using Capsules

```rust
use dep::aztec::capsules;

// Storing data
capsules::store(contract_address, slot, value);

// Loading data
let value: Option<T> = capsules::load(contract_address, slot);

// Deleting data
capsules::delete(contract_address, slot);
```

### CapsuleArray

`CapsuleArray<T>` is a type that provides a dynamically sized array backed by capsules. It automatically handles storage layout and management.

```rust
// Creating/connecting to an array
let array = CapsuleArray::<T>::at(contract_address, base_slot);

// Adding an element
array.push(value);

// Getting an element
let value = array.get(index);

// Removing an element
array.remove(index);
```

## AuthWits (Authentication Witnesses)

Authentication Witness (AuthWit) is a scheme for authenticating actions on Aztec, allowing users to permit third parties (e.g., protocols or other users) to execute actions on their behalf.

### Key Characteristics of AuthWits

- **Action Authorization**: allows authorizing a specific action for execution by a third party
- **Security**: a safer alternative to infinite approvals in the style of ERC20
- **Flexibility**: can be used in both private and public contexts

### AuthWit Structure

An AuthWit consists of:
- `requestHash` - hash of the authorization request
- `witness` - authentication evidence for the hash

The request hash is calculated as follows:

```rust
authentication_witness_action = H(
    caller: AztecAddress,
    contract: AztecAddress,
    selector: Field,
    argsHash: Field
);
```

### Example of Using AuthWit

```rust
// In a contract that wants to verify authorization
let is_authorized = auth::is_authorized_caller(
    context,
    on_behalf_of,
    caller,
    function_selector,
    args_hash
);
```

## Args Packing

Args Packing is a mechanism for efficiently transmitting function arguments in Aztec transactions. It uses hashing to optimize data transmission.

### Key Characteristics of Args Packing

- **Efficiency**: reduces the size of data transmitted in transactions
- **Integrity**: ensures data integrity through hashing
- **Optimization**: allows efficient transmission of large volumes of data

### HashedValues Class

`HashedValues` is a container for storing a list of values and their hash:

```typescript
class HashedValues {
  constructor(
    // Raw values
    public readonly values: Fr[],
    // Hash of the raw values
    public readonly hash: Fr,
  ) {}
}
```

### Example of Using Args Packing

```typescript
// Creating HashedValues from values
const hashedValues = await HashedValues.fromValues(values);

// Using in a transaction
const txRequest = TxExecutionRequest.from({
  firstCallArgsHash: entrypointHashedArgs.hash,
  origin: dappEntrypointAddress,
  functionSelector,
  txContext: new TxContext(chainId, version, gasSettings),
  argsOfCalls: [...payload.hashedArguments, entrypointHashedArgs],
  authWitnesses: [authWitness],
  capsules,
});
```

## DataBus

DataBus is an optimization that the backend can use to improve recursion efficiency. It allows efficient transmission of large volumes of public data between circuits.

### Key Characteristics of DataBus

- **Recursion Optimization**: makes recursion more efficient
- **Modifiers**: uses the `call_data` and `return_data` modifiers
- **Efficiency**: prover work is proportional only to the data used

### Example of Using DataBus

```rust
fn main(mut x: u32, y: call_data u32, z: call_data [u32;4]) -> return_data u32 {
  let a = z[x];
  a+y
}
```

As a result, both `call_data` and `return_data` will be treated as private inputs and encapsulated into a read-only array for the backend to process.

## Choosing the Appropriate Data Transmission Mechanism

- **Capsules**: use when you need to store data locally for a contract and access it later
- **AuthWits**: use for authorizing actions performed on behalf of a user
- **Args Packing**: use for efficient transmission of function arguments in transactions
- **DataBus**: use for optimizing recursion and efficient transmission of large volumes of data between circuits

## Conclusion

Aztec Protocol provides various mechanisms for data transmission, each optimized for specific use cases. Understanding these mechanisms will help you create more efficient and secure smart contracts in the Aztec ecosystem.
