---
title: Retrieving and Filtering Notes
sidebar_position: 0
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

```rust
fn filter_above_threshold(
    notes: [Option<RetrievedNote<Note>>; MAX_NOTES],
    min: Field,
) -> [Option<RetrievedNote<Note>>; MAX_NOTES] {
    let mut result = [Option::none(); MAX_NOTES];
    let mut count = 0;
    
    for note in notes {
        if note.is_some() & (note.unwrap().note.value >= min) {
            result[count] = note;
            count += 1;
        }
    }
    result
}

// Use the filter
let options = NoteGetterOptions::with_filter(filter_above_threshold, min_value);
```

:::warning Note Limits
Maximum notes per call: `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` (currently 128)
:::

:::info Available Comparators

- `EQ`: Equal to
- `NEQ`: Not equal to
- `LT`: Less than
- `LTE`: Less than or equal
- `GT`: Greater than
- `GTE`: Greater than or equal

:::

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

## View notes without constraints

```rust
use dep::aztec::note::note_viewer_options::NoteViewerOptions;

#[utility]
unconstrained fn view_notes(comparator: u8, value: Field) -> auto {
    let mut options = NoteViewerOptions::new();
    options = options.select(MyNote::properties().value, comparator, value);
    storage.my_notes.view_notes(options)
}
```

:::tip Viewer vs Getter

- `NoteGetterOptions`: For constrained functions (private/public)
- `NoteViewerOptions`: For unconstrained viewing (utilities)

:::

## Query notes with different status

### Set status to include nullified notes

```rust
let mut options = NoteGetterOptions::new();
options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
```

:::info Note Status Options

- `NoteStatus.ACTIVE`: Only active (non-nullified) notes (default)
- `NoteStatus.ACTIVE_OR_NULLIFIED`: Both active and nullified notes

:::

## Optimize note retrieval

:::tip Best Practices

1. **Use select over filter** - Database-level filtering is more efficient
2. **Set limits early** - Reduce unnecessary note processing
3. **Sort before limiting** - Get the most relevant notes first
4. **Batch operations** - Retrieve all needed notes in one call

:::

### Example: Optimized retrieval

```rust
// Get highest value note for owner
let mut options = NoteGetterOptions::new();
options = options
    .select(MyNote::properties().owner, Comparator.EQ, owner)
    .sort(MyNote::properties().value, SortOrder.DESC)
    .set_limit(1);

let notes = storage.my_notes.at(owner).get_notes(options);
assert(notes.len() > 0, "No notes found");
let highest_note = notes.get(0);
```

## Next steps

- Learn about [custom note implementations](../how_to_implement_custom_notes.md)
- Explore [note discovery mechanisms](../../../concepts/advanced/storage/note_discovery.md)
- Understand [note lifecycle](../../../concepts/advanced/storage/indexed_merkle_tree.mdx)
