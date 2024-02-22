## Standalone Functions

### new

```rust
new();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| NoteViewerOptions&lt;Note, N&gt; where Note: NoteInterface&lt;N&gt; |

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

