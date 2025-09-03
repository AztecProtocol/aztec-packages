---
title: Defining Contract Functions
sidebar_position: 4
tags: [functions, smart-contracts]
description: Define different types of functions in your Aztec smart contracts for various execution environments.
---

This guide shows you how to define different types of functions in your Aztec contracts, each serving specific purposes and execution environments.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Basic understanding of Noir programming language
- Familiarity with Aztec's execution model (private vs public)

## Define private functions

Create functions that execute privately on user devices using the `#[private]` annotation:

```rust
// Performs an action. Requires that msg.sender is authorized.
#[private]
fn execute_private_action(param1: AztecAddress, param2: u128, param3: AztecAddress) {
    let sender = context.msg_sender();

    let note = storage.owner.get_note();
    assert(note.get_address() == sender);
    OtherContract::at(param1).some_function(param3, param2).call(&mut context);
}
```

Private functions maintain privacy of user inputs and execution logic.

## Define public functions

Create functions that execute on the sequencer using the `#[public]` annotation:

```rust
#[public]
fn create_item(recipient: AztecAddress, item_id: Field) {
    assert(item_id != 0, "zero item ID not supported");
    assert(storage.authorized_users.at(context.msg_sender()).read(), "caller is not authorized");
    assert(storage.items.at(item_id).read() == false, "item already exists");

    storage.items.at(item_id).write(true);

    storage.owners.at(item_id).write(recipient);
}
```

Public functions can access both public and private state, similar to EVM contracts.

## Define utility functions

Create off-chain query functions using the `#[utility]` annotation:

```rust
#[utility]
unconstrained fn get_private_items(
    owner: AztecAddress,
    page_index: u32,
) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
    let offset = page_index * MAX_NOTES_PER_PAGE;
    let mut options = NoteViewerOptions::new();
    let notes = storage.private_items.at(owner).view_notes(options.set_offset(offset));

    let mut owned_item_ids = [0; MAX_NOTES_PER_PAGE];
    for i in 0..options.limit {
        if i < notes.len() {
            owned_item_ids[i] = notes.get_unchecked(i).get_item_id();
        }
    }

    let page_limit_reached = notes.len() == options.limit;
    (owned_item_ids, page_limit_reached)
}
```

Utility functions run unconstrained and are never included in transactions.

## Define view functions

Create read-only functions using the `#[view]` annotation combined with `#[private]` or `#[public]`:

```rust
#[public]
#[view]
fn get_config_value() -> Field {
    storage.config_value.read().to_field()
}
```

View functions guarantee they cannot modify contract state.

## Define internal functions

Create contract-only functions using the `#[internal]` annotation:

```rust
#[public]
#[internal]
fn update_counter_public(item: Field) {
    assert(storage.process_active.read() == true, "Process is not active"); // assert that process is active
    let new_count = storage.counters.at(item).read() + 1;
    storage.counters.at(item).write(new_count);
}
```

Internal functions are only callable within the same contract.

## Define initializer functions

Create constructor-like functions using the `#[initializer]` annotation:

```rust
#[private]
#[initializer]
fn constructor() {
    // initialization logic
}
```

Complete example:

```rust
#[public]
#[initializer]
fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, version: u8) {
    assert(!admin.is_zero(), "invalid admin");
    storage.admin.write(admin);
    storage.authorized_users.at(admin).write(true);
    storage.name.initialize(FieldCompressedString::from_string(name));
    storage.symbol.initialize(FieldCompressedString::from_string(symbol));
    storage.version.initialize(version);
}
```

### Use multiple initializers

Define multiple initialization options:

1. Mark each function with `#[initializer]`
2. Choose which one to call during deployment
3. Any initializer marks the contract as initialized

## Create library methods

Define reusable contract logic as regular functions (no special annotation needed):

```rust
#[contract_library_method]
fn process_value(
    context: &mut PrivateContext,
    storage: Storage<&mut PrivateContext>,
    account: AztecAddress,
    value: u128,
    max_items: u32,
) -> u128 {
    let processed = storage.values.at(account).try_process(value, max_items);
    assert(processed > 0 as u128, "Value too low");
    if processed >= value {
        processed - value
    } else {
        let remaining = value - processed;
        compute_recurse_process_call(*context, account, remaining).call(context)
    }
}
```

Library methods are inlined when called and reduce code duplication.
