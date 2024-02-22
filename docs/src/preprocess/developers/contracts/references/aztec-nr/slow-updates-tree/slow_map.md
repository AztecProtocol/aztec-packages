## Standalone Functions

### compute_next_change

```rust
compute_next_change(time);
```

#### Parameters
| Name | Type |
| --- | --- |
| time | Field |

#### Returns
| Type |
| --- |
| Field |

### read_root

```rust
read_root(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

#### Returns
| Type |
| --- |
| Leaf |

### initialize

```rust
initialize(self, initial_root);
```

Beware that the initial root could include much state that is not shown by the public storage!

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| initial_root | Field |

### current_root

```rust
current_root(self);
```

Reads the "CURRENT" value of the root

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

#### Returns
| Type |
| --- |
| Field |

### read_leaf_at

```rust
read_leaf_at(self, key);
```

docs:start:read_leaf_at

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| key | Field |

#### Returns
| Type |
| --- |
| Leaf |

### read_at

```rust
read_at(self, key);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| key | Field |

#### Returns
| Type |
| --- |
| Field |

### update_at

```rust
update_at(self, p, M>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| p | SlowUpdateProof&lt;N |
| M&gt; |  |

### update_unsafe_at

```rust
update_unsafe_at(self, index, leaf_value, new_root);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| index | Field |
| leaf_value | Field |
| new_root | Field |

### update_unsafe

```rust
update_unsafe(self, index, leaf, root);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| index | Field |
| leaf | Leaf |
| root | Leaf |

### compute_merkle_root

```rust
compute_merkle_root(leaf, index, hash_path);
```

#### Parameters
| Name | Type |
| --- | --- |
| leaf | Field |
| index | Field |
| hash_path | [Field; N] |

#### Returns
| Type |
| --- |
| Field |

