# Note Module

The note module provides core functionality for working with notes in Aztec's privacy system. Notes are the fundamental building blocks of private state, representing encrypted data that can only be read by specific recipients.

## Overview

This module handles:

- **Note Management**: Creating, storing, and retrieving notes
- **Note Filtering**: Querying notes by various criteria
- **Note Status**: Tracking note lifecycle (active, nullified, pending)
- **Extended Notes**: Notes with contextual metadata
- **Note Comparators**: Filtering notes by field values

## Core Concepts

### What is a Note?

A note is the basic unit of private state in Aztec. Think of notes like private UTXOs (Unspent Transaction Outputs) in Bitcoin, but more flexible:

- **Private**: Notes are encrypted and only readable by the recipient
- **Immutable**: Once created, notes cannot be modified
- **Consumable**: Notes can be "nullified" (spent/consumed) only once
- **Flexible**: Can contain any structured data (balances, permissions, etc.)

```typescript
import { Note, Fr } from '@aztec/stdlib';

// A note is a vector of field elements
const note = new Note([
  new Fr(1000),      // e.g., balance
  ownerAddress.toField(),  // e.g., owner
  new Fr(42)         // e.g., some other data
]);
```

## Note Types

### Basic Note

The core `Note` class represents raw note data:

```typescript
import { Note, Fr } from '@aztec/stdlib';

// Create from field elements
const note = new Note([
  new Fr(100),
  new Fr(200),
  new Fr(300)
]);

// Serialize/deserialize
const buffer = note.toBuffer();
const restored = Note.fromBuffer(buffer);

// String representation
const hex = note.toString();
const fromHex = Note.fromString(hex);

// Properties
console.log(note.length);  // 3
console.log(note.items);   // [Fr(100), Fr(200), Fr(300)]

// Comparison
const areEqual = note.equals(otherNote);
```

### ExtendedNote

Includes contextual metadata about where and how the note was created:

```typescript
import { ExtendedNote, Note, Fr, AztecAddress, TxHash } from '@aztec/stdlib';

const extendedNote = new ExtendedNote(
  note,              // The note data
  recipient,         // Who can decrypt it
  contractAddress,   // Which contract created it
  storageSlot,       // Storage location in contract
  txHash             // Transaction that created it
);

// Access contextual data
console.log(extendedNote.note);            // The raw note
console.log(extendedNote.recipient);       // AztecAddress
console.log(extendedNote.contractAddress); // AztecAddress
console.log(extendedNote.storageSlot);     // Fr
console.log(extendedNote.txHash);          // TxHash

// Serialize/deserialize
const buffer = extendedNote.toBuffer();
const restored = ExtendedNote.fromBuffer(buffer);
```

### UniqueNote

Extends `ExtendedNote` with a nonce for guaranteed uniqueness:

```typescript
import { UniqueNote, Fr } from '@aztec/stdlib';

const uniqueNote = new UniqueNote(
  note,
  recipient,
  contractAddress,
  storageSlot,
  txHash,
  noteNonce          // Guarantees uniqueness
);

// The nonce ensures that even identical note data
// produces different note hashes
console.log(uniqueNote.noteNonce);  // Fr
```

**Why UniqueNote?**
- Prevents note hash collisions
- Enables multiple identical-value notes
- Required for some contract patterns

## Note Filtering

Query notes using flexible filter criteria:

```typescript
import { NotesFilter, NoteStatus } from '@aztec/stdlib';

// Basic filter: Get all active notes for a contract
const filter: NotesFilter = {
  contractAddress: tokenContract.address
};

// Filter by recipient
const myNotesFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  recipient: myAddress
};

// Filter by storage slot (e.g., specific token balance storage)
const balanceFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  storageSlot: balanceStorageSlot,
  recipient: myAddress
};

// Filter by transaction
const txNotesFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  txHash: transactionHash
};

// Filter by status
const nullifiedFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  status: NoteStatus.NULLIFIED
};

// Filter by siloed nullifier
const specificNoteFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  siloedNullifier: noteNullifier
};

// Scoped filter (search in specific accounts/contracts)
const scopedFilter: NotesFilter = {
  contractAddress: tokenContract.address,
  scopes: [account1.address, account2.address]
};

// Fetch notes with filter
const notes = await pxe.getNotes(filter);
```

### NotesFilter Parameters

All filter parameters are combined as an intersection (AND logic):

- **contractAddress** (required): The contract that created the notes
- **txHash**: Notes from a specific transaction
- **storageSlot**: Notes in a specific storage location
- **recipient**: Notes encrypted for a specific address
- **status**: Note lifecycle status (ACTIVE, NULLIFIED, PENDING)
- **siloedNullifier**: Notes with a specific nullifier
- **scopes**: Limit search to specific accounts/contracts

## Note Status

Notes have a lifecycle status:

```typescript
import { NoteStatus } from '@aztec/stdlib';

// ACTIVE (default): Note exists and can be spent
const activeFilter = {
  contractAddress,
  status: NoteStatus.ACTIVE
};

// ACTIVE_OR_NULLIFIED: Include both active and spent notes
const allFilter = {
  contractAddress,
  status: NoteStatus.ACTIVE_OR_NULLIFIED
};

// NULLIFIED: Only spent/consumed notes
const spentFilter = {
  contractAddress,
  status: NoteStatus.NULLIFIED
};

// Note status lifecycle:
// 1. Created → ACTIVE
// 2. Spent → NULLIFIED (irreversible)
```

## Note Comparators

Filter notes by comparing field values:

```typescript
import { Comparator } from '@aztec/stdlib';

// Comparator operators
Comparator.EQ   // Equal
Comparator.NEQ  // Not equal
Comparator.LT   // Less than
Comparator.LTE  // Less than or equal
Comparator.GT   // Greater than
Comparator.GTE  // Greater than or equal

// Example: Filter notes with balance > 100
// (This is typically used in contract code, not directly in TypeScript)
```

## Common Patterns

### 1. Fetch All User Notes

```typescript
// Get all active notes for a user in a specific contract
const userNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  recipient: userAddress,
  status: NoteStatus.ACTIVE
});

console.log(`User has ${userNotes.length} unspent notes`);
```

### 2. Fetch Notes from Transaction

```typescript
// Get all notes created in a specific transaction
const txNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  txHash: deploymentTxHash
});

console.log(`Transaction created ${txNotes.length} notes`);
```

### 3. Track Note Spending

```typescript
// Before spending
const beforeNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  recipient: myAddress,
  status: NoteStatus.ACTIVE
});

// Spend a note (creates a nullifier)
await tokenContract.methods.transfer(recipient, amount).send().wait();

// After spending
const afterNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  recipient: myAddress,
  status: NoteStatus.ACTIVE
});

const spentCount = beforeNotes.length - afterNotes.length;
console.log(`Spent ${spentCount} notes`);

// Check nullified notes
const nullifiedNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  recipient: myAddress,
  status: NoteStatus.NULLIFIED
});
```

### 4. Query Specific Storage Slot

```typescript
// Different note types often live in different storage slots
const balanceNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  storageSlot: balanceStorageSlot,
  recipient: userAddress
});

const metadataNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  storageSlot: metadataStorageSlot,
  recipient: userAddress
});
```

### 5. Multi-Account Note Discovery

```typescript
// Search notes across multiple accounts
const multiAccountNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  scopes: [
    account1.address,
    account2.address,
    account3.address
  ]
});

// Useful for:
// - Wallet with multiple accounts
// - Contract managing multiple sub-accounts
// - Aggregating balances across accounts
```

## Note Encryption & Decryption

While not directly exposed in this module, understanding encryption is important:

### How Notes are Encrypted

```typescript
// 1. Contract emits note in Noir
// emit_encrypted_note(recipient_address, note_data);

// 2. Aztec encrypts note with recipient's public key
// - Uses recipient's incoming viewing key
// - Note can only be decrypted by recipient

// 3. Encrypted note is stored in logs
// - Available to anyone to download
// - But only recipient can decrypt
```

### Note Discovery

```typescript
// PXE automatically:
// 1. Downloads encrypted note logs
// 2. Attempts decryption with user's keys
// 3. Stores successfully decrypted notes
// 4. Makes them available via getNotes()

// This happens automatically when:
const notes = await pxe.getNotes(filter);
// PXE has already discovered and decrypted these notes
```

## Performance Considerations

### 1. Filter Specificity

```typescript
// SLOW: Broad filter searches many notes
const allNotes = await pxe.getNotes({
  contractAddress
});

// FASTER: Specific filter narrows search
const specificNotes = await pxe.getNotes({
  contractAddress,
  storageSlot,
  recipient: myAddress,
  status: NoteStatus.ACTIVE
});
```

### 2. Note Synchronization

```typescript
// First call may be slow (syncs private state)
const notes = await pxe.getNotes({ contractAddress });

// Subsequent calls are faster (uses cached data)
const moreNotes = await pxe.getNotes({ contractAddress, recipient });
```

### 3. Status Filtering

```typescript
// FASTEST: Only active notes (default)
const active = await pxe.getNotes({
  contractAddress,
  status: NoteStatus.ACTIVE
});

// SLOWER: Includes nullified notes (more to search)
const all = await pxe.getNotes({
  contractAddress,
  status: NoteStatus.ACTIVE_OR_NULLIFIED
});
```

## Security Considerations

### 1. Note Privacy

```typescript
// GOOD: Notes encrypted to specific recipient
const note = new ExtendedNote(
  noteData,
  recipientAddress,  // Only this address can decrypt
  contractAddress,
  storageSlot,
  txHash
);

// Notes are private by default
// - Only recipient can read note contents
// - Others see encrypted blobs
// - Note hashes are public (but not contents)
```

### 2. Note Uniqueness

```typescript
// RISKY: Reusing note data without nonce
const note1 = new ExtendedNote(data, recipient, contract, slot, tx1);
const note2 = new ExtendedNote(data, recipient, contract, slot, tx2);
// Same note hash if data is identical!

// SAFE: Use UniqueNote with nonce
const note1 = new UniqueNote(data, recipient, contract, slot, tx1, nonce1);
const note2 = new UniqueNote(data, recipient, contract, slot, tx2, nonce2);
// Different note hashes guaranteed
```

### 3. Nullifier Privacy

```typescript
// Note nullifiers reveal that a note was spent
// but not which note specifically (due to siloing)

// When spending a note:
// - Nullifier is published (public)
// - Links to note hash (private)
// - Observer can't link nullifier to original note creation
```

## Best Practices

### 1. Always Specify Contract Address

```typescript
// REQUIRED: Contract address triggers private state sync
const notes = await pxe.getNotes({
  contractAddress: contract.address  // Always required
});
```

### 2. Use Specific Filters

```typescript
// BETTER: Specific filter is faster and more secure
const myTokenNotes = await pxe.getNotes({
  contractAddress: tokenContract.address,
  storageSlot: balanceSlot,
  recipient: myAddress,
  status: NoteStatus.ACTIVE
});

// AVOID: Overly broad filters
const allNotes = await pxe.getNotes({
  contractAddress: tokenContract.address
});
```

### 3. Check Note Status

```typescript
// Before using notes, verify they're active
const notes = await pxe.getNotes({
  contractAddress,
  recipient: myAddress,
  status: NoteStatus.ACTIVE  // Explicitly request active notes
});

// Process only unspent notes
for (const note of notes) {
  // Use note in transaction
}
```

### 4. Handle Note Arrays Properly

```typescript
// Notes are often used in batches
const notes = await pxe.getNotes(filter);

// Calculate total (e.g., balance)
const total = notes.reduce((sum, extNote) => {
  const amount = extNote.note.items[0];  // Assuming first field is amount
  return sum.add(amount);
}, Fr.ZERO);

// Select notes for spending
const notesToSpend = selectNotesForAmount(notes, requiredAmount);
```

## Related Modules

- **abi/**: Note selectors and encoding
- **contract/**: Contract addresses and instances
- **aztec-address/**: Address types for recipients
- **trees/**: Note hash trees and witnesses

## Additional Resources

- [Notes and Storage](https://docs.aztec.network/developers/contracts/writing_contracts/storage)
- [Privacy Model](https://docs.aztec.network/learn/concepts/storage/state_model)
- [Note Discovery](https://docs.aztec.network/learn/concepts/accounts/keys#note-discovery)
