---
title: How to Retrieve and Filter Notes
tags: [private-state, smart-contracts, notes]
description: Step-by-step guide to retrieving, filtering, and sorting notes from private storage in Aztec contracts.
---

This guide shows you how to retrieve and filter notes from private storage using `NoteGetterOptions`.

## Prerequisites

- Aztec contract with note storage
- Understanding of note structure and properties
- Familiarity with PropertySelector and Comparator

## Set up basic note retrieval

### Step 1: Create default options

```rust
let mut options = NoteGetterOptions::new();
```

This returns up to `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` notes without filtering.

### Step 2: Retrieve notes from storage

```rust
let notes = storage.my_notes.at(owner).get_notes(options);
```

## Filter notes by properties

### Step 1: Select notes with specific field values

```rust
pub fn get_notes_by_owner<let M: u32>(
    owner: AztecAddress,
) -> NoteGetterOptions<MyNote, M, Field, Field>
where
    MyNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    options.select(MyNote::properties().owner, Comparator.EQ, owner)
}
```

### Step 2: Apply multiple selection criteria

```rust
pub fn get_exact_note<let M: u32>(
    value: Field,
    secret: Field,
    owner: AztecAddress,
) -> NoteGetterOptions<MyNote, M, Field, Field>
where
    MyNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    options
        .select(MyNote::properties().value, Comparator.EQ, value)
        .select(MyNote::properties().randomness, Comparator.EQ, secret)
        .select(MyNote::properties().owner, Comparator.EQ, owner)
}
```

## Sort retrieved notes

### Step 1: Sort by a single field

```rust
let mut options = NoteGetterOptions::new();
options.sort(MyNote::properties().value, SortOrder.DESC)
```

### Step 2: Combine sorting with filtering

```rust
let mut options = NoteGetterOptions::new();
options
    .select(MyNote::properties().owner, Comparator.EQ, owner)
    .sort(MyNote::properties().value, SortOrder.DESC)
    .set_offset(offset)  // Skip first 'offset' notes
```

## Apply advanced filtering

### Step 1: Create a custom filter function

```rust
pub fn filter_min_value(
    notes: [Option<RetrievedNote<MyNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_value: Field,
) -> [Option<RetrievedNote<MyNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected_notes = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut num_selected = 0;

    for i in 0..notes.len() {
        if notes[i].is_some() & notes[i].unwrap_unchecked().note.get_value() >= min_value {
            selected_notes[num_selected] = notes[i];
            num_selected += 1;
        }
    }
    selected_notes
}
```

### Step 2: Use the filter with NoteGetterOptions

```rust
pub fn get_notes_above_threshold<let M: u32>(
    min_value: Field,
) -> NoteGetterOptions<MyNote, M, Field, Field>
where
    MyNote: Packable<N = M>,
{
    NoteGetterOptions::with_filter(filter_min_value, min_value)
        .sort(MyNote::properties().value, SortOrder.ASC)
}
```

:::tip
Filters are applied after database selection, so using `select` with comparators is more efficient when possible.
:::

## Limit and paginate results

### Step 1: Set a maximum number of notes

```rust
let mut options = NoteGetterOptions::new();
options
    .sort(MyNote::properties().value, SortOrder.DESC)
    .set_limit(10)  // Return at most 10 notes
```

### Step 2: Implement pagination with offset

```rust
pub fn get_paginated_notes<let M: u32>(
    page_size: u32,
    page_number: u32,
) -> NoteGetterOptions<MyNote, M, Field, Field>
where
    MyNote: Packable<N = M>,
{
    let offset = page_size * page_number;
    let mut options = NoteGetterOptions::new();
    options
        .set_limit(page_size)
        .set_offset(offset)
}
```

## Use comparators effectively

### Available comparators

```rust
// Equal to
options.select(MyNote::properties().value, Comparator.EQ, target_value)

// Greater than or equal
options.select(MyNote::properties().value, Comparator.GTE, min_value)

// Less than
options.select(MyNote::properties().value, Comparator.LT, max_value)
```

### Call from TypeScript with comparator

```typescript
// Pass comparator from client
contract.methods.read_notes(Comparator.GTE, 5).simulate({ from: defaultAddress })
```

## Handle the retrieved notes

### Step 1: Define a viewer function

```rust
#[utility]
unconstrained fn read_notes(comparator: u8, value: Field) -> BoundedVec<MyNote, 10> {
    let mut options = NoteViewerOptions::new();
    storage.my_notes.view_notes(
        options.select(MyNote::properties().value, comparator, value)
    )
}
```

### Step 2: Process retrieved notes

```rust
#[private]
fn process_notes(owner: AztecAddress) {
    let options = NoteGetterOptions::new()
        .select(MyNote::properties().owner, Comparator.EQ, owner);

    let notes = storage.my_notes.at(owner).get_notes(options);

    for note in notes {
        // Process each note
        let value = note.get_value();
        // Perform operations with the note
    }
}
```

## Query historical notes

### Step 1: Set status to include nullified notes

```rust
let mut options = NoteGetterOptions::new();
options.set_status(NoteStatus.ACTIVE_AND_NULLIFIED)
```

:::warning
When querying both active and nullified notes, you cannot determine which notes have been nullified without additional checks.
:::

## Optimize note retrieval

### Best practices

1. **Use select over filter when possible** - Selection happens at the database level
2. **Limit results early** - Set appropriate limits to reduce processing
3. **Index frequently queried fields** - Structure notes for efficient queries
4. **Batch related operations** - Retrieve all needed notes in one call

### Example: Optimized retrieval

```rust
pub fn get_highest_value_note<let M: u32>(
    owner: AztecAddress,
) -> MyNote
where
    MyNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    let notes = storage.my_notes.at(owner).get_notes(
        options
            .select(MyNote::properties().owner, Comparator.EQ, owner)
            .sort(MyNote::properties().value, SortOrder.DESC)
            .set_limit(1)
    );

    assert(notes.len() > 0, "No notes found");
    notes[0]
}
```

## Next steps

- Learn about [custom note implementations](../how_to_implement_custom_notes.md)
- Explore [note discovery mechanisms](../../../../aztec/concepts/advanced/storage/note_discovery.md)
- Understand [note lifecycle](../../../../aztec/concepts/advanced/storage/indexed_merkle_tree.mdx)
