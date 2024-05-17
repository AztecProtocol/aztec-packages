# PropertySelector

## Fields
| Field | Type |
| --- | --- |
| index | u8 |
| offset | u8 |
| length | u8 |

# ComparatorEnum

## Fields
| Field | Type |
| --- | --- |
| EQ | u8 |
| NEQ | u8 |
| LT | u8 |
| LTE | u8 |
| GT | u8 |
| GTE | u8 |

# Select

## Fields
| Field | Type |
| --- | --- |
| property_selector | PropertySelector |
| value | Field |
| comparator | u8 |

## Methods

### new

```rust
Select::new(property_selector, value, comparator);
```

#### Parameters
| Name | Type |
| --- | --- |
| property_selector | PropertySelector |
| value | Field |
| comparator | u8 |

# SortOrderEnum

## Fields
| Field | Type |
| --- | --- |
| DESC | u8 |
| ASC | u8 |

# Sort

## Fields
| Field | Type |
| --- | --- |
| property_selector | PropertySelector |
| order | u8 |

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
| ACTIVE | u8 |
| ACTIVE_OR_NULLIFIED | u8 |

## Standalone Functions

### return_all_notes

```rust
return_all_notes(notes, _p);
```

#### Parameters
| Name | Type |
| --- | --- |
| notes | [Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| _p | Field |

### with_filter

```rust
with_filter(filter, FILTER_ARGS);
```

#### Parameters
| Name | Type |
| --- | --- |
| filter | fn([Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| FILTER_ARGS |  |

### select

```rust
select(&mut self, property_selector, value, comparator);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| property_selector | PropertySelector |
| value | T |
| comparator | Option&lt;u8&gt; |

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

