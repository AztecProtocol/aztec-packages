# NoteStageEnum

## Fields
| Field | Type |
| --- | --- |
| PENDING_SAME_PHASE | u8 |
| PENDING_PREVIOUS_PHASE | u8 |
| SETTLED | u8 |

# NoteMetadata

## Fields
| Field | Type |
| --- | --- |
| stage | u8 |
| maybe_nonce | Field |

## Methods

### from_raw_data

/ Constructs a `NoteMetadata` object from optional note hash counter and nonce. Both a zero note hash counter and / a zero nonce are invalid, so those are used to signal non-existent values.

```rust
NoteMetadata::from_raw_data(nonzero_note_hash_counter, maybe_nonce);
```

#### Parameters
| Name | Type |
| --- | --- |
| nonzero_note_hash_counter | bool |
| maybe_nonce | Field |

### is_pending_same_phase

/ Returns true if the note is pending **and** from the same phase, i.e. if it's been created in the current / transaction during the current execution phase (either non-revertible or revertible).

```rust
NoteMetadata::is_pending_same_phase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### is_pending_previous_phase

/ Returns true if the note is pending **and** from the previous phase, i.e. if it's been created in the current / transaction during an execution phase prior to the current one. Because private execution only has two phases / with strict ordering, this implies that the note was created in the non-revertible phase, and that the current / phase is the revertible phase.

```rust
NoteMetadata::is_pending_previous_phase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### is_settled

/ Returns true if the note is settled, i.e. if it's been created in a prior transaction and is therefore already / in the note hash tree.

```rust
NoteMetadata::is_settled(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### to_pending_same_phase

/ Asserts that the metadata is that of a pending note from the same phase and converts it accordingly.

```rust
NoteMetadata::to_pending_same_phase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### to_pending_previous_phase

/ Asserts that the metadata is that of a pending note from a previous phase and converts it accordingly.

```rust
NoteMetadata::to_pending_previous_phase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### to_settled

/ Asserts that the metadata is that of a settled note and converts it accordingly.

```rust
NoteMetadata::to_settled(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

# PendingSamePhaseNoteMetadata

/ The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel / read requests, as well as the correct nullifier to avoid double-spends. / / This represents a pending same phase note, i.e. a note that was created in the transaction that is currently being / executed during the current execution phase (either non-revertible or revertible).

## Methods

### new

```rust
PendingSamePhaseNoteMetadata::new();
```

Takes no parameters.

# PendingPreviousPhaseNoteMetadata

/ The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel / read requests, as well as the correct nullifier to avoid double-spends. / / This represents a pending previous phase note, i.e. a note that was created in the transaction that is currently / being executed, during the previous execution phase. Because there are only two phases and their order is always the / same (first non-revertible and then revertible) this implies that the note was created in the non-revertible phase, / and that the current phase is the revertible phase.

## Fields
| Field | Type |
| --- | --- |
| nonce | Field |

## Methods

### new

```rust
PendingPreviousPhaseNoteMetadata::new(nonce);
```

#### Parameters
| Name | Type |
| --- | --- |
| nonce | Field |

### nonce

```rust
PendingPreviousPhaseNoteMetadata::nonce(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

# SettledNoteMetadata

/ The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel / read requests, as well as the correct nullifier to avoid double-spends. / / This represents a settled note, i.e. a note that was created in a prior transaction and is therefore already in the / note hash tree.

## Fields
| Field | Type |
| --- | --- |
| nonce | Field |

## Methods

### new

```rust
SettledNoteMetadata::new(nonce);
```

#### Parameters
| Name | Type |
| --- | --- |
| nonce | Field |

### nonce

```rust
SettledNoteMetadata::nonce(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### from

```rust
from(_value);
```

#### Parameters
| Name | Type |
| --- | --- |
| _value | PendingSamePhaseNoteMetadata |

### from

```rust
from(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | PendingPreviousPhaseNoteMetadata |

### from

```rust
from(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | SettledNoteMetadata |

