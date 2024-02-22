# ComparatorEnum

## Fields
| Field | Type |
| --- | --- |
| EQ | u3 |
| NEQ | u3 |
| LT | u3 |
| LTE | u3 |
| GT | u3 |
| GTE | u3 |

# Select

## Fields
| Field | Type |
| --- | --- |
| field_index | u8 |
| value | Field |
| comparator | u3 |

## Methods

### new

```rust
Select::new(field_index, value, comparator);
```

#### Parameters
| Name | Type |
| --- | --- |
| field_index | u8 |
| value | Field |
| comparator | u3 |

#### Returns
| Type |
| --- |
| Self |

# SortOrderEnum

## Fields
| Field | Type |
| --- | --- |
| DESC | u2 |
| ASC | u2 |

# Sort

## Fields
| Field | Type |
| --- | --- |
| field_index | u8 |
| order | u2 |

## Methods

### new

```rust
Sort::new(field_index, order);
```

#### Parameters
| Name | Type |
| --- | --- |
| field_index | u8 |
| order | u2 |

#### Returns
| Type |
| --- |
| Self |

# NoteStatusEnum

## Fields
| Field | Type |
| --- | --- |
| ACTIVE | u2 |
| ACTIVE_OR_NULLIFIED | u2 |

## Standalone Functions

### select

```rust
select(&mut self, field_index, value, comparator);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| field_index | u8 |
| value | Field |
| comparator | Option&lt;u3&gt; |

#### Returns
| Type |
| --- |
| Self |

### sort

```rust
sort(&mut self, field_index, order);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| field_index | u8 |
| order | u2 |

#### Returns
| Type |
| --- |
| Self |

### set_limit

```rust
set_limit(&mut self, limit);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| limit | u32 |

#### Returns
| Type |
| --- |
| Self |

### set_offset

```rust
set_offset(&mut self, offset);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| offset | u32 |

#### Returns
| Type |
| --- |
| Self |

### set_status

```rust
set_status(&mut self, status);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| status | u2 |

#### Returns
| Type |
| --- |
| Self |

