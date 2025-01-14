## Standalone Functions

### pack_arguments

```rust
pack_arguments(args);
```

/// This is only used during private execution, since in public it is the VM itself that keeps track of arguments.

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field] |

### pack_arguments_array

```rust
pack_arguments_array(args);
```

/ Same as `pack_arguments`, but using arrays instead of slices.

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### pack_arguments_oracle_wrapper

```rust
pack_arguments_oracle_wrapper(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field] |

### pack_arguments_array_oracle_wrapper

```rust
pack_arguments_array_oracle_wrapper(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### pack_arguments_oracle

```rust
pack_arguments_oracle(_args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _args | [Field] |

### pack_arguments_array_oracle

```rust
pack_arguments_array_oracle(_args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _args | [Field; N] |

