# PropertySelector

## Fields
| Field | Type |
| --- | --- |
| pub(crate) index | u8, // index of the field in the serialized note array |
| pub(crate) offset | u8, // offset in the byte representation of the field (selected with index above) from which to reading |
| pub(crate) length | u8, // number of bytes to read after the offset |

# Select

## Fields
| Field | Type |
| --- | --- |
| pub(crate) property_selector | PropertySelector |
| pub(crate) comparator | u8 |
| pub(crate) value | Field |

## Methods

### new

The selected property will be the left hand side and value the right hand side of the operation, so e.g. the object created by new(property, Comparator.GT, value) represents 'property &gt; value'.

```rust
Select::new(property_selector, comparator, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| property_selector | PropertySelector |
| comparator | u8 |
| value | Field |

# SortOrderEnum

## Fields
| Field | Type |
| --- | --- |
| pub DESC | u8 |
| pub ASC | u8 |

# Sort

## Fields
| Field | Type |
| --- | --- |
| pub(crate) property_selector | PropertySelector |
| pub(crate) order | u8 |

## Methods

### new

```rust
Sort::new(property_selector, order);
```

#### Parameters
| Name | Type |
| --- | --- |
| property_selector | PropertySelector |
| order | u8 |

# NoteStatusEnum

## Fields
| Field | Type |
| --- | --- |
| pub ACTIVE | u8 |
| pub ACTIVE_OR_NULLIFIED | u8 |

## Standalone Functions

### return_all_notes

```rust
return_all_notes(notes, _p, );
```

This is the default filter and preprocessor, which does nothing

#### Parameters
| Name | Type |
| --- | --- |
| notes | [Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| _p | Field |
|  |  |

### select

```rust
select(&mut self, property_selector, comparator, value, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| property_selector | PropertySelector |
| comparator | u8 |
| value | T |
|  |  |

### sort

```rust
sort(&mut self, property_selector, order);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| property_selector | PropertySelector |
| order | u8 |

### set_limit

```rust
set_limit(&mut self, limit);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| limit | u32 |

### set_offset

```rust
set_offset(&mut self, offset);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| offset | u32 |

### set_status

```rust
set_status(&mut self, status);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| status | u8 |

### with_preprocessor

```rust
with_preprocessor(preprocessor, PREPROCESSOR_ARGS);
```

#### Parameters
| Name | Type |
| --- | --- |
| preprocessor | fn([Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| PREPROCESSOR_ARGS |  |

### with_filter

```rust
with_filter(filter, FILTER_ARGS);
```

#### Parameters
| Name | Type |
| --- | --- |
| filter | fn([Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| FILTER_ARGS |  |

