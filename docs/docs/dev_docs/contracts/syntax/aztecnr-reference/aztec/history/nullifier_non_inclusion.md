---
title: Nullifier non-inclusion
---

# prove_nullifier_non_inclusion
Proves that a nullifier does not exist at a specified block number. This function ensures that the nullifier is not part of the nullifier tree at that block.

## Arguments
| Argument Name | Type           | Description                                      |
|---------------|----------------|--------------------------------------------------|
| nullifier     | Field          | The nullifier to be proven non-existent         |
| block_number  | u32            | Block number at which to prove non-existence    |
| context       | PrivateContext | Context for executing the proof                 |

# prove_note_not_nullified
Proves that a note was not nullified at a specified block number by computing its nullifier and then proving the nullifier's non-inclusion.

## Type Parameters
| Type Parameter | Description                                      |
|----------------|--------------------------------------------------|
| Note           | The type of note being proven                    |
| N              | The length of the array in the note interface    |

## Arguments
| Argument Name    | Type                    | Description                                        |
|------------------|-------------------------|----------------------------------------------------|
| note_interface   | NoteInterface<Note, N>  | Interface for handling note-related operations     |
| note_with_header | Note                    | The note whose non-nullification is to be proven   |
| block_number     | u32                     | Block number at which the note's non-nullification is proved |
| context          | PrivateContext          | Context for executing the proof                    |
