# Validity conditions

The _validity conditions_ of a transaction define when a [_transaction object_](./tx-object.md) is valid. Nodes should check the validity of a transaction when they receive it either directly or through the p2p pool, and if they found it invalid, should drop it immediately and not broadcast it.

In addition to being well-formed, the transaction object needs to pass the following checks:

- **Proof is valid**: The `proof` for the given public `data` should be valid according to a protocol-wide verification key for the final private kernel circuit.
- **No double-spends**: No `nullifier` in the transaction `data` should be already present in the nullifier tree.
- **No pending private function calls**: The `data` private call stack should be empty.
- **Valid historic data**: The tree roots in the historic block data of `data` must match the tree roots of a block in the chain.
- **Preimages must match commitments in `data`**: The expanded fields in the transaction object should match the commitments (hashes) to them in the public `data`.
  - The `encryptedLogs` should match the `encryptedLogsHash` and `encryptedLogPreimagesLength` in the transaction `data`.
  - The `unencryptedLogs` should match the `unencryptedLogsHash` and `unencryptedLogPreimagesLength` in the transaction `data`.
  - Each public call stack item in the transaction `data` should have a corresponding preimage in the `enqueuedPublicFunctionCalls`.
  - Each new contract data in transaction `data` should have a corresponding preimage in the `newContracts`.

Note that all checks but the last one are enforced by the base rollup circuit when the transaction is included in a block.