# AccountActions

## Fields
| Field | Type |
| --- | --- |
| context | Context |
| is_valid_impl | fn(&mut PrivateContext, Field) -&gt; bool |
| approved_action | Map&lt;Field, PublicMutable&lt;bool&gt;&gt; |

## Methods

### init

```rust
AccountActions::init(context, approved_action_storage_slot, is_valid_impl, Field);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| approved_action_storage_slot | Field |
| is_valid_impl | fn(&mut PrivateContext |
| Field |  |

### private

```rust
AccountActions::private(context, approved_action_storage_slot, is_valid_impl, Field);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| approved_action_storage_slot | Field |
| is_valid_impl | fn(&mut PrivateContext |
| Field |  |

### public

```rust
AccountActions::public(context, approved_action_storage_slot, is_valid_impl, Field);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| approved_action_storage_slot | Field |
| is_valid_impl | fn(&mut PrivateContext |
| Field |  |

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

### spend_private_authwit

```rust
AccountActions::spend_private_authwit(self, inner_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| inner_hash | Field |

### spend_public_authwit

```rust
AccountActions::spend_public_authwit(self, inner_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| inner_hash | Field |

### approve_public_authwit

```rust
AccountActions::approve_public_authwit(self, message_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| message_hash | Field |

