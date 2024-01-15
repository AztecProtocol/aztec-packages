---
title: Note inclusion
---

# prove_note_commitment_inclusion
Proves the inclusion of a note commitment in a specific block. Validates that the given note commitment is part of the note hash tree at a specified block number.

## Arguments
| Argument Name    | Type           | Description                                          |
|------------------|----------------|------------------------------------------------------|
| note_commitment  | Field          | The note commitment to be proven                     |
| block_number     | u32            | Block number at which the note's existence is proved |
| context          | PrivateContext | Context for executing the proof                      |

# prove_note_inclusion
Proves the inclusion of a note in a specific block by computing its unique siloed note hash and then proving its commitment inclusion. This function uses a provided note interface to handle specific note types.

## Type Parameters
| Type Parameter | Description                                      |
|----------------|--------------------------------------------------|
| Note           | The type of note being proven                    |
| N              | The length of the array in the note interface    |

## Arguments
| Argument Name    | Type                           | Description                                          |
|------------------|--------------------------------|------------------------------------------------------|
| note_interface   | NoteInterface<Note, N>         | Interface for handling note-related operations       |
| note_with_header | Note                           | The note whose inclusion is to be proven             |
| block_number     | u32                            | Block number at which the note's existence is proved |
| context          | PrivateContext                 | Context for executing the proof                      |
