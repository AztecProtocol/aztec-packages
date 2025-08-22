---
title: Declare Contract Storage
sidebar_position: 1
tags: [contracts, storage]
description: Comprehensive guide to storage management in your Aztec smart contracts.
---

On this page, you will learn how to define storage in your smart contract.

To learn more about how storage works in Aztec, read [the concepts](../../../aztec/concepts/storage/index.md).

Declare storage for your contract by defining a struct and annotating it as `#[storage]`. This will be made available to you through the reserved `storage` keyword within your contract functions.

You can declare public and private state variables in your storage struct.

## Example

For example, the following is the storage struct for the NFT contract:

#include_code storage_struct /noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr rust

:::info

The `Context` parameter is injected into storage and contract functions. It provides information about the current execution mode (e.g. private or public).

:::

Read more about the data types available in the [Storage Types](./storage_types.md) page.
