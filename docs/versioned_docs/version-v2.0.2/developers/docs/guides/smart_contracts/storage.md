---
title: Declare Contract Storage
sidebar_position: 1
tags: [contracts, storage]
description: Comprehensive guide to storage management in your Aztec smart contracts.
---

On this page, you will learn how to define storage in your smart contract.

To learn more about how storage works in Aztec, read [the concepts](../../concepts/storage/index.md).

Declare storage for your contract by defining a struct and annotating it as `#[storage]`. This will be made available to you through the reserved `storage` keyword within your contract functions.

You can declare public and private state variables in your storage struct.

## Example

For example, the following is the storage struct for the NFT contract:

```rust title="storage_struct" showLineNumbers
#[storage]
struct Storage<Context> {
    // The symbol of the NFT
    symbol: PublicImmutable<FieldCompressedString, Context>,
    // The name of the NFT
    name: PublicImmutable<FieldCompressedString, Context>,
    // The admin of the contract
    admin: PublicMutable<AztecAddress, Context>,
    // Addresses that can mint
    minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    // Contains the NFTs owned by each address in private.
    private_nfts: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
    // A map from token ID to a boolean indicating if the NFT exists.
    nft_exists: Map<Field, PublicMutable<bool, Context>, Context>,
    // A map from token ID to the public owner of the NFT.
    public_owners: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L41-L61" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L41-L61</a></sub></sup>


:::info

The `Context` parameter is injected into storage and contract functions. It provides information about the current execution mode (e.g. private or public).

:::

Read more about the data types available in the [Storage Types](./storage_types.md) page.
