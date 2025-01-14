# StorageLayoutFields

## Standalone Functions

### storage

```rust
storage(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |

### init

```rust
init(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |

### init

```rust
init(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |

### storage_no_init

```rust
storage_no_init(_s);
```

#### Parameters
| Name | Type |
| --- | --- |
| _s | StructDefinition |

### generate_storage_field_constructor

```rust
generate_storage_field_constructor(typ, slot, parent_is_map, );
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |
| slot | Quoted |
| parent_is_map | bool |
|  |  |

### new

```rust
new(context, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| slot | Field |

### is_storage_map

```rust
is_storage_map(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### add_context_generic

```rust
add_context_generic(typ, context_generic);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |
| context_generic | Type |

