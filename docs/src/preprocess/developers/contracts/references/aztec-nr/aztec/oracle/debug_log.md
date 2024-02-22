## Standalone Functions

### debug_log_oracle

```rust
debug_log_oracle(_msg, _num_args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _msg | T |
| _num_args | Field |

#### Returns
| Type |
| --- |
| Field |

### debug_log_format_oracle

```rust
debug_log_format_oracle(_msg, _args, _num_args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _msg | T |
| _args | [Field; N] |
| _num_args | Field |

#### Returns
| Type |
| --- |
| Field |

### debug_log_field_oracle

```rust
debug_log_field_oracle(_field);
```

#### Parameters
| Name | Type |
| --- | --- |
| _field | Field |

#### Returns
| Type |
| --- |
| Field |

### debug_log_array_oracle

```rust
debug_log_array_oracle(_arbitrary_array);
```

#### Parameters
| Name | Type |
| --- | --- |
| _arbitrary_array | [T; N] |

#### Returns
| Type |
| --- |
| Field |

### debug_log_array_with_prefix_oracle

```rust
debug_log_array_with_prefix_oracle(_prefix, _arbitrary_array);
```

#### Parameters
| Name | Type |
| --- | --- |
| _prefix | S |
| _arbitrary_array | [T; N] |

#### Returns
| Type |
| --- |
| Field |

### debug_log

```rust
debug_log(msg);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg | T |

### debug_log_format

```rust
debug_log_format(msg, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg | T |
| args | [Field; N] |

### debug_log_field

```rust
debug_log_field(field);
```

#### Parameters
| Name | Type |
| --- | --- |
| field | Field |

### debug_log_array

```rust
debug_log_array(arbitrary_array);
```

#### Parameters
| Name | Type |
| --- | --- |
| arbitrary_array | [T; N] |

### debug_log_array_with_prefix

```rust
debug_log_array_with_prefix(prefix, arbitrary_array);
```

#### Parameters
| Name | Type |
| --- | --- |
| prefix | S |
| arbitrary_array | [T; N] |

