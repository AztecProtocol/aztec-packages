# EventSelector

## Fields
| Field | Type |
| --- | --- |
| inner | u32 |

## Methods

### from_u32

```rust
EventSelector::from_u32(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | u32 |

### from_signature

```rust
EventSelector::from_signature(signature);
```

#### Parameters
| Name | Type |
| --- | --- |
| signature | str&lt;N&gt; |

### zero

```rust
EventSelector::zero();
```

Takes no parameters.

## Standalone Functions

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | EventSelector |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

### deserialize

```rust
deserialize(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; 1] |

### from_field

```rust
from_field(field);
```

#### Parameters
| Name | Type |
| --- | --- |
| field | Field |

### to_field

```rust
to_field(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### empty

```rust
empty();
```

Takes no parameters.

