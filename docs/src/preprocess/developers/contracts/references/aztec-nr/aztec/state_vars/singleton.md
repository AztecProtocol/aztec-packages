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

#### Returns
| Type |
| --- |
| Self |

### compute_initialization_nullifier

```rust
compute_initialization_nullifier(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### is_initialized

```rust
is_initialized(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| bool |

### get_note

```rust
get_note(self, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| broadcast | bool |

#### Returns
| Type |
| --- |
| Note where Note: NoteInterface&lt;N&gt; |

### view_note

```rust
view_note(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Note where Note: NoteInterface&lt;N&gt; |

