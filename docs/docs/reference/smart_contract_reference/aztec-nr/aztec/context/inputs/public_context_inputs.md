# PublicContextInputs

PublicContextInputs are expected to be provided to each public function

## Fields
| Field | Type |
| --- | --- |
| call_context | CallContext |
| historical_header | Header |
| public_global_variables | PublicGlobalVariables |
| start_side_effect_counter | u32 |
| gas_left | Gas |
| transaction_fee | Field |

## Standalone Functions

### empty

```rust
empty();
```

Takes no parameters.

