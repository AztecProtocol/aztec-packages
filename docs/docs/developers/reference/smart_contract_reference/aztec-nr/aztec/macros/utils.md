# Foo

The event selector is computed from the type signature of the struct in the event, similar to how one might type the constructor function. For example, given: 

## Standalone Functions

### get_fn_visibility

```rust
get_fn_visibility(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_private

```rust
is_fn_private(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_public

```rust
is_fn_public(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_view

```rust
is_fn_view(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_internal

```rust
is_fn_internal(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_initializer

```rust
is_fn_initializer(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### fn_has_noinitcheck

```rust
fn_has_noinitcheck(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### modify_fn_body

```rust
modify_fn_body(body, prepend, append);
```

#### Parameters
| Name | Type |
| --- | --- |
| body | [Expr] |
| prepend | Quoted |
| append | Quoted |

### add_to_field_slice

```rust
add_to_field_slice(slice_name, name, typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| slice_name | Quoted |
| name | Quoted |
| typ | Type |

### add_to_hasher

```rust
add_to_hasher(hasher_name, name, typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| hasher_name | Quoted |
| name | Quoted |
| typ | Type |

### signature_of_type

```rust
signature_of_type(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### as_str_quote

```rust
as_str_quote(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### as_str_quote

```rust
as_str_quote(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### compute_fn_selector

```rust
compute_fn_selector(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### foo

```rust
foo(a, b);
```

#### Parameters
| Name | Type |
| --- | --- |
| a | Field |
| b | AztecAddress |

### compute_event_selector

```rust
compute_event_selector(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |

### get_serialized_size

```rust
get_serialized_size(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### module_has_storage

```rust
module_has_storage(m);
```

#### Parameters
| Name | Type |
| --- | --- |
| m | Module |

### module_has_initializer

```rust
module_has_initializer(m);
```

#### Parameters
| Name | Type |
| --- | --- |
| m | Module |

### is_note

```rust
is_note(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

