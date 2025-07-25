# Foo

The struct selector is computed from the type signature, similar to how one might type the constructor function. For example, given: 

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

### is_fn_utility

```rust
is_fn_utility(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_contract_library_method

```rust
is_fn_contract_library_method(f);
```

#### Parameters
| Name | Type |
| --- | --- |
| f | FunctionDefinition |

### is_fn_test

```rust
is_fn_test(f);
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

### add_to_field_array

```rust
add_to_field_array(array_name, index_name, name, typ, );
```

#### Parameters
| Name | Type |
| --- | --- |
| array_name | Quoted |
| index_name | Quoted |
| name | Quoted |
| typ | Type |
|  |  |

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

### compute_struct_selector

```rust
compute_struct_selector(s, from_signature_fn, );
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |
| from_signature_fn | Quoted |
|  |  |

### get_storage_size

```rust
get_storage_size(typ);
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

### get_trait_impl_method

```rust
get_trait_impl_method(typ, target_trait, target_method, );
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |
| target_trait | Quoted |
| target_method | Quoted |
|  |  |

### size_in_fields

```rust
size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### array_size_in_fields

```rust
array_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### bool_size_in_fields

```rust
bool_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### field_size_in_fields

```rust
field_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### int_size_in_fields

```rust
int_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### constant_size_in_fields

```rust
constant_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### str_size_in_fields

```rust
str_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### struct_size_in_fields

```rust
struct_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### tuple_size_in_fields

```rust
tuple_size_in_fields(typ);
```

#### Parameters
| Name | Type |
| --- | --- |
| typ | Type |

### derive_serialize_if_not_implemented

```rust
derive_serialize_if_not_implemented(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

