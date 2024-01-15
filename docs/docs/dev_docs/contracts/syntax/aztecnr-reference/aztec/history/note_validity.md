---
title: Note validity
---

# prove_note_validity
Proves the validity of a note at a specified block number. It ensures that the note exists at that block number and has not been nullified.

## Type Parameters
| Type Parameter | Description                                      |
|----------------|--------------------------------------------------|
| Note           | The type of note being proven                    |
| N              | The length of the array in the note interface    |

## Arguments
| Argument Name    | Type                           | Description                                          |
|------------------|--------------------------------|------------------------------------------------------|
| note_interface   | NoteInterface<Note, N>         | Interface for handling note-related operations       |
| note_with_header | Note                           | The note whose validity is to be proven              |
| block_number     | u32                            | Block number at which the note's validity is proved  |
| context          | PrivateContext                 | Context for executing the proof                      |
