## Standalone Functions

### new

```rust
new();
```

Takes no parameters.

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

