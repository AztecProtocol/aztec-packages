## Standalone Functions

### new

```rust
new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### compute_initialization_nullifier

```rust
compute_initialization_nullifier(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### is_initialized

```rust
is_initialized(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### initialize

```rust
initialize(self, note, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | &mut Note |
| broadcast | bool |

### replace

```rust
replace(self, new_note, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| new_note | &mut Note |
| broadcast | bool |

### get_note

```rust
get_note(self, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| broadcast | bool |

### view_note

```rust
view_note(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

