## Standalone Functions

### create_note_getter_options_for_decreasing_balance

```rust
create_note_getter_options_for_decreasing_balance(amount);
```

Pick the fewest notes whose sum is equal to or greater than `amount`.

#### Parameters
| Name | Type |
| --- | --- |
| amount | Field |

#### Returns
| Type |
| --- |
| NoteGetterOptions&lt;ValueNote, VALUE_NOTE_LEN, Field&gt; |

### increment

```rust
increment(balance, amount, recipient);
```

Inserts it to the recipient's set of notes.

#### Parameters
| Name | Type |
| --- | --- |
| balance | Set&lt;ValueNote&gt; |
| amount | Field |
| recipient | AztecAddress |

### decrement

```rust
decrement(balance, amount, owner);
```

Fail if the sum of the selected notes is less than the amount.

#### Parameters
| Name | Type |
| --- | --- |
| balance | Set&lt;ValueNote&gt; |
| amount | Field |
| owner | AztecAddress |

### decrement_by_at_most

```rust
decrement_by_at_most(balance, max_amount, owner);
```

// It returns the decremented amount, which should be less than or equal to max_amount.

#### Parameters
| Name | Type |
| --- | --- |
| balance | Set&lt;ValueNote&gt; |
| max_amount | Field |
| owner | AztecAddress |

#### Returns
| Type |
| --- |
| Field |

### destroy_note

```rust
destroy_note(balance, owner, note);
```

Returns the value of the destroyed note.

#### Parameters
| Name | Type |
| --- | --- |
| balance | Set&lt;ValueNote&gt; |
| owner | AztecAddress |
| note | ValueNote |

#### Returns
| Type |
| --- |
| Field |

