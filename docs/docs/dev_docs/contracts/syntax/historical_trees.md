---
title: Accessing History
---

The Aztec Protocol uses an append-only Merkle tree to store the headers of all previous blocks in the chain as its leaves. You can learn more about how it works in the [concepts section](../../../concepts/advanced/data_structures/trees.md#historical-access-tree).

On this page you will learn how you can integrate inclusion and non-inclusion proofs into your own smart contract.

# Historical tree library

The historical tree library allows you to access any of the following at a given block height before the current height:

* [Private notes](#note-inclusion)
* [Notes that have been nullified](#nullifier-inclusion)
* [Notes that have not been nullified](#note-validity)
* [Public values](#public-value-inclusion)
* [Contracts](#contract-inclusion)

Using the historical access tree, you can check that specific notes or nullifiers happened at specific blocks. This can be useful for things such as:

* Verifying a timestamp that was created in a private context
* Checking eligibility based on historical events (eg for an airdrop) 
* Verifying historic ownership / relinquishing of assets

# How to integrate historical access and inclusion proofs into your smart contract

Checking if a value was included in a certain block is called an inclusion proof. Similarly, checking that a value was not included is called a non-inclusion proof.

In this section we will talk about how to integrate the different types of inclusion and non-inclusion proofs into your smart contract.

## Note inclusion 

Note inclusion proves that someone owned a note at a specific block number.

### 1. Import note_inclusion into your smart contract

```rust
aztec::{
history::{
    #include_code import_note_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
      }
}
```
### 2. Call prove_note_inclusion

`prove_note_inclusion` takes 4 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| note_interface  | NoteInterface<Note, N> | Interface for the note with necessary functionality|
| note_with_header| Note                   | The note you are proving inclusion for             |
| block_number    | u32                    | Block number for proving note's existence           |
| context         | PrivateContext         | Private context     |

#### Example

#include_code prove_note_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

### 3. You can also prove the note commitment with prove_note_commitment_inclusion

`prove_note_commitment_inclusion takes 3 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| commitment  | Field | Note commitment we are checking inclusion of |   
| block_number    | u32                    | Block number for proving note's existence           |
| context| PrivateContext                   | Private Context |    

#### Example

#include_code prove_note_commitment_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

## Note validity

This proves that a note exists and has not been nullified at a specified block.

### 1. Import note_validity

```rust
aztec::{
history::{
    #include_code import_note_validity yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
      }
}
```
### 2. Call prove_note_validity

`prove_note_validity` takes 4 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| note_interface  | NoteInterface<Note, N> | Interface for the note with necessary functionality|
| note_with_header| Note                   | The note you are proving inclusion for             |
| block_number    | u32                    | Block number for proving note's existence           |
| context         | PrivateContext         | Private context     |

#### Example

#include_code prove_note_validity yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

## Nullifier inclusion

This proves that a nullifier was included, ie a note had been nullified, in a certain block. 

### 1. Import nullifier_inclusion

```rust
aztec::{
history::{
    #include_code import_nullifier_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
      }
}
```

### 2. Call prove_nullifier_inclusion

`prove_nullifier_inclusion` takes 3 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| nullifier | Field                   | The nullifier you are proving inclusion for             |
| block_number    | u32                    | Block number for proving note's existence           |
| context         | PrivateContext         | Private context     |

#### Example

#include_code prove_nullifier_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

## Nullifier non inclusion

This proves that a nullifier was not included, ie a note had not been nullified, in a certain block.

### 1. Import nullifier_non_inclusion

```rust
aztec::{
history::{
    #include_code import_nullifier_non_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
      }
}
```

### 2. Call prove_nullifier_non_inclusion

`prove_nullifier_non_inclusion` takes 3 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| nullifier | Field                   | The nullifier you are proving inclusion for             |
| block_number    | u32                    | Block number for proving note's existence           |
| context         | PrivateContext         | Private context     |
                           
#### Example

TODO #include_code prove_nullifier_non_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust
 
### 3. Call note_not_nullified

Instead of passing the nullifier, you can check that a note has not been nullified by passing the note.

TODO #include_code prove_note_not_nullified yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

## Public value inclusion

This proves that a public value exists at a certain block.

### 1. Import public_value_inclusion

```rust
aztec::{
history::{
    #include_code import_public_value_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
}
}
```

### 2. Call prove_public_value_inclusion

`prove_public_value_inclusion` takes 3 parameters:

| Name            | Type                   | Description                                         |
|-----------------|------------------------|-----------------------------------------------------|
| value | Field                   | The public value you are proving inclusion for             |
| storage_slot    | Field                    | Storage slot the value exists in          |
| block_number         | u32         | Block number for proving value's existence     |
| context         | PrivateContext         | Private context     |

### Example

#include_code prove_public_value_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust

## Contract inclusion

This proves that a contract exists in, ie had been deployed before or in, a certain block.

### 1. Import contract_inclusion

```rust
aztec::{
history::{
    #include_code import_contract_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr raw
      }
}
```

### 2. Call prove_contract_inclusion

`prove_contract_inclusion` takes 7 parameters:

| Name                      | Type            | Description                                           |
|---------------------------|-----------------|-------------------------------------------------------|
| deployer_public_key       | GrumpkinPoint   | Public key of the contract deployer                   |
| contract_address_salt     | Field           | Unique identifier for the contract's address          |
| function_tree_root        | Field           | Root of the contract's function tree                  |
| constructor_hash          | Field           | Hash of the contract's constructor                    |
| portal_contract_address   | EthAddress      | Ethereum address of the associated portal contract             |
| block_number              | u32             | Block number for proof verification                   |
| context                   | PrivateContext  | Private context                    |

If there is no associated portal contract, you can use a zero Ethereum address:

```ts
new EthAddress(Buffer.alloc(EthAddress.SIZE_IN_BYTES));
```

### Example

TODO #include_code prove_contract_inclusion yarn-project/noir-contracts/contracts/inclusion_proofs_contract/src/main.nr rust