# AccountActions

## Fields
| Field | Type |
| --- | --- |
| context | Context |
| is_valid_impl | fn(&mut PrivateContext, Field) -&gt; bool |
| approved_action | Map&lt;Field, PublicState&lt;bool&gt;&gt; |

## Methods

### entrypoint

```rust
AccountActions::entrypoint(self, app_payload, fee_payload);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| app_payload | AppPayload |
| fee_payload | FeePayload |

### is_valid

```rust
AccountActions::is_valid(self, message_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| message_hash | Field |

#### Returns
| Type |
| --- |
| Field |

### is_valid_public

```rust
AccountActions::is_valid_public(self, message_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| message_hash | Field |

#### Returns
| Type |
| --- |
| Field |

### internal_set_is_valid_storage

```rust
AccountActions::internal_set_is_valid_storage(self, message_hash, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| message_hash | Field |
| value | bool |

