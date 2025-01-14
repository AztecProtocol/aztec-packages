# FieldCompressedString

A Fixedsize Compressed String. Essentially a special version of Compressed String for practical use.

## Fields
| Field | Type |
| --- | --- |
| value | Field |

## Methods

### is_eq

```rust
FieldCompressedString::is_eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | FieldCompressedString |

### from_field

```rust
FieldCompressedString::from_field(input_field);
```

#### Parameters
| Name | Type |
| --- | --- |
| input_field | Field |

### from_string

```rust
FieldCompressedString::from_string(input_string);
```

#### Parameters
| Name | Type |
| --- | --- |
| input_string | str&lt;31&gt; |

### to_bytes

```rust
FieldCompressedString::to_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize

```rust
deserialize(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; 1] |

