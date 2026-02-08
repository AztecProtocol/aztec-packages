---
title: Retrieving and Filtering Notes
sidebar_position: 0
tags: [private-state, smart-contracts, notes]
description: Step-by-step guide to retrieving, filtering, and sorting notes from private storage in Aztec contracts.
references: ["noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr", "noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/filter.nr"]
---

This guide shows you how to retrieve and filter notes from private storage using `NoteGetterOptions`.

## Prerequisites

- Aztec contract with note storage
- Understanding of note structure and properties

## Required imports

```rust
use dep::aztec::note::note_getter_options::{NoteGetterOptions, NoteStatus, SortOrder};
use dep::aztec::utils::comparison::Comparator;
```

## Set up basic note retrieval

### Step 1: Create default options

```rust
let mut options = NoteGetterOptions::new();
```

This returns up to `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` notes without filtering.

### Step 2: Retrieve notes from storage

```rust
// Returns BoundedVec<HintedNote<MyNote>, ...>
let hinted_notes = storage.my_notes.at(owner).get_notes(options);
```

:::tip get_notes vs pop_notes

- `get_notes`: Retrieves notes without nullifying. Note data is not guaranteed to be current or non-nullified—use when you only need to read note data without consuming it.
- `pop_notes`: Retrieves AND nullifies notes in one operation. Use when consuming notes (e.g., spending tokens). More efficient than calling `get_notes` followed by manual nullification.

:::

Here's an example of `pop_notes` with filtering from the NFT contract:

```rust title="pop_notes" showLineNumbers 
let notes = nfts.at(from).pop_notes(NoteGetterOptions::new()
    .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
    .set_limit(1));
assert(notes.len() == 1, "NFT not found when transferring");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L249-L254" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L249-L254</a></sub></sup>


## Filter notes by properties

### Step 1: Select notes with specific field values

```rust
// Assuming MyNote has an 'owner' field
let mut options = NoteGetterOptions::new();
options = options.select(
    MyNote::properties().owner,
    Comparator.EQ,
    owner
);
```

### Step 2: Apply multiple selection criteria

```rust
let mut options = NoteGetterOptions::new();
options = options
    .select(MyNote::properties().value, Comparator.EQ, value)
    .select(MyNote::properties().owner, Comparator.EQ, owner);
```

:::tip
Chain multiple `select` calls to filter by multiple fields. Remember to call `get_notes(options)` after applying all your selection criteria to retrieve the filtered notes.
:::

## Sort retrieved notes

### Sort and paginate results

```rust
let mut options = NoteGetterOptions::new();
options = options
    .select(MyNote::properties().owner, Comparator.EQ, owner)
    .sort(MyNote::properties().value, SortOrder.DESC)
    .set_limit(10)     // Max 10 notes
    .set_offset(20);   // Skip first 20
```

## Apply custom filters

:::tip Filter Performance
Database `select` is more efficient than custom filters. Use custom filters only for complex logic.
:::

### Create and use a custom filter

```rust title="custom_filter" showLineNumbers 
pub fn filter_notes_min_sum(
    notes: [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: Field,
) -> [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    let mut sum = 0;
    for i in 0..notes.len() {
        if notes[i].is_some() & full_field_less_than(sum, min_sum) {
            let hinted_note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(hinted_note);
            sum += hinted_note.note.value;
        }
    }

    selected
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/filter.nr#L9-L27" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/filter.nr#L9-L27</a></sub></sup>


Then use it with `NoteGetterOptions`:

```rust
let options = NoteGetterOptions::with_filter(filter_notes_min_sum, min_value);
```

:::warning Note Limits
Maximum notes per call: `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` (currently 16)
:::

:::info Available Comparators

- `Comparator.EQ`: Equal to
- `Comparator.NEQ`: Not equal to
- `Comparator.LT`: Less than
- `Comparator.LTE`: Less than or equal
- `Comparator.GT`: Greater than
- `Comparator.GTE`: Greater than or equal

:::

## Call from TypeScript

You can pass comparator values from TypeScript to your contract functions:

```typescript
import { Comparator } from '@aztec/aztec.js/note';

// Pass comparator to a contract function that accepts it as a parameter
await contract.methods.read_notes(Comparator.GTE, 5).simulate({ from: senderAddress });
```

## View notes without constraints

Use `NoteViewerOptions` in unconstrained utility functions to query notes without generating proofs:

```rust title="view_notes" showLineNumbers 
#[external("utility")]
unconstrained fn get_private_nfts(
    owner: AztecAddress,
    page_index: u32,
) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
    let offset = page_index * MAX_NOTES_PER_PAGE;
    let options = NoteViewerOptions::new().set_offset(offset);
    let notes = self.storage.private_nfts.at(owner).view_notes(options);

    let mut owned_nft_ids = [0; MAX_NOTES_PER_PAGE];
    for i in 0..options.limit {
        if i < notes.len() {
            owned_nft_ids[i] = notes.get_unchecked(i).token_id;
        }
    }

    let page_limit_reached = notes.len() == options.limit;
    (owned_nft_ids, page_limit_reached)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L294-L314" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L294-L314</a></sub></sup>


:::tip Viewer vs Getter

- `NoteGetterOptions`: For constrained private functions with proof generation (max 16 notes)
- `NoteViewerOptions`: For unconstrained utility functions, no proofs (max 10 notes per page via `MAX_NOTES_PER_PAGE`)

:::

## Query notes with different status

### Set status to include nullified notes

```rust
let mut options = NoteGetterOptions::new();
options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
```

:::info Note Status Options

- `NoteStatus.ACTIVE`: Only active (non-nullified) notes (default)
- `NoteStatus.ACTIVE_OR_NULLIFIED`: Both active and nullified notes

:::

## Next steps

- Learn about [custom note implementations](../how_to_implement_custom_notes.md)
- Explore [note discovery mechanisms](../../../foundational-topics/advanced/storage/note_discovery.md)
- Understand [partial notes](./partial_notes.md)
