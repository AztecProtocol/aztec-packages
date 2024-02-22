# Hasher

## Fields
| Field | Type |
| --- | --- |
| fields | Field] |

## Methods

### new

```rust
Hasher::new();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| Self |

### add

```rust
Hasher::add(&mut self, field);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| field | Field |

## Standalone Functions

### hash

```rust
hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### add_multiple

```rust
add_multiple(&mut self, fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| fields | [Field; N] |

