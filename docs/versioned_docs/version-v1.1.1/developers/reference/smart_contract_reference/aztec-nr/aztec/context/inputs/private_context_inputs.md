# PrivateContextInputs

PrivateContextInputs are expected to be provided to each private function

## Fields
| Field | Type |
| --- | --- |
| pub call_context | CallContext |
| pub historical_header | BlockHeader |
| pub tx_context | TxContext |
| pub start_side_effect_counter | u32 |

## Standalone Functions

### empty

```rust
empty();
```

Takes no parameters.

