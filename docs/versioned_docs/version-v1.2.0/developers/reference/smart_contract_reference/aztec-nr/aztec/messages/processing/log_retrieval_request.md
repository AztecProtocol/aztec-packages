# LogRetrievalRequest

/ A request for the `bulk_retrieve_logs` oracle to fetch either: /  - a public log emitted by `contract_address` with `unsiloed_tag` /  - a private log with tag equal to `silo_private_log(unsiloed_tag, contract_address)`.

## Fields
| Field | Type |
| --- | --- |
| pub contract_address | AztecAddress |
| pub unsiloed_tag | Field |

## Standalone Functions

### serialization_matches_typescript

```rust
serialization_matches_typescript();
```

Takes no parameters.

