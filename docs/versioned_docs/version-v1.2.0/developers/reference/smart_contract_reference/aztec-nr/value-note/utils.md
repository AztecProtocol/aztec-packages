## Standalone Functions

### create_note_getter_options_for_decreasing_balance

```rust
create_note_getter_options_for_decreasing_balance(amount, );
```

Pick the fewest notes whose sum is equal to or greater than `amount`.

#### Parameters
| Name | Type |
| --- | --- |
| amount | Field |
|  |  |

### increment

```rust
increment(// docs, &mut PrivateContext>, amount, recipient, // docs, );
```

Inserts it to the recipient's set of notes.

#### Parameters
| Name | Type |
| --- | --- |
| // docs | start |
| &mut PrivateContext&gt; |  |
| amount | Field |
| recipient | AztecAddress |
| // docs | end |
|  |  |

### decrement

```rust
decrement(balance, &mut PrivateContext>, amount, owner, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| balance | PrivateSet&lt;ValueNote |
| &mut PrivateContext&gt; |  |
| amount | Field |
| owner | AztecAddress |
| sender | AztecAddress |
|  |  |

### decrement_by_at_most

```rust
decrement_by_at_most(balance, &mut PrivateContext>, max_amount, owner, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| balance | PrivateSet&lt;ValueNote |
| &mut PrivateContext&gt; |  |
| max_amount | Field |
| owner | AztecAddress |
| sender | AztecAddress |
|  |  |

