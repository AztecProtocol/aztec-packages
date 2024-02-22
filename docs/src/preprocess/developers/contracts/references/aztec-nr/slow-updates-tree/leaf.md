# Leaf

A leaf in the tree.

## Fields
| Field | Type |
| --- | --- |
| next_change | Field |
| before | Field |
| after | Field |

## Standalone Functions

### serialize

```rust
serialize(leaf);
```

#### Parameters
| Name | Type |
| --- | --- |
| leaf | Leaf |

#### Returns
| Type |
| --- |
| Field; 3] |

### deserialize

```rust
deserialize(serialized);
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized | [Field; 3] |

#### Returns
| Type |
| --- |
| Leaf |

