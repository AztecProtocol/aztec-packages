## Standalone Functions

### at

```rust
at(contract_address, base_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| base_slot | Field |

### len

```rust
len(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### push

```rust
push(self, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value | T |

### get

```rust
get(self, index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| index | u32 |

### remove

```rust
remove(self, index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| index | u32 |

### for_each

```rust
for_each(self, f, T);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| f | unconstrained fn[Env](u32 |
| T |  |

### slot_at

```rust
slot_at(self, index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| index | u32 |

### setup

```rust
setup();
```

Takes no parameters.

### empty_array

```rust
empty_array();
```

Takes no parameters.

### empty_array_read

```rust
empty_array_read();
```

Takes no parameters.

### array_push

```rust
array_push();
```

Takes no parameters.

### read_past_len

```rust
read_past_len();
```

Takes no parameters.

### array_remove_last

```rust
array_remove_last();
```

Takes no parameters.

### array_remove_some

```rust
array_remove_some();
```

Takes no parameters.

### array_remove_all

```rust
array_remove_all();
```

Takes no parameters.

### for_each_called_with_all_elements

```rust
for_each_called_with_all_elements();
```

Takes no parameters.

### for_each_remove_some

```rust
for_each_remove_some();
```

Takes no parameters.

### for_each_remove_all

```rust
for_each_remove_all();
```

Takes no parameters.

### for_each_remove_all_no_copy

```rust
for_each_remove_all_no_copy();
```

Takes no parameters.

