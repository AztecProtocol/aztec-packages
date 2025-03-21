---
title: Declaring Storage
sidebar_position: 2
tags: [contracts, storage]
---

On this page, you will learn how to define storage in your smart contract.

To learn more about how storage works in Aztec, read [the concepts](./storage_slots.md).

[See the storage reference](../../../../reference/smart_contract_reference/storage/index.md).

```rust
#[storage]
struct Storage {
  // public state variables
  // private state variables
}
```

If you have defined a struct and annotated it as `#[storage]`, then it will be made available to you through the reserved `storage` keyword within your contract functions.
