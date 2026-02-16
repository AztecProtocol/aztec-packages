# Archiver L1 Data Retrieval

Modules and classes to handle data retrieval from L1 for the archiver.

## Calldata Retriever

The sequencer publisher bundles multiple operations into a single multicall3 transaction for gas
efficiency. The archiver needs to extract the `propose` calldata from these bundled transactions
to reconstruct L2 blocks.

The retriever uses hash matching against `attestationsHash` and `payloadDigest` from the
`CheckpointProposed` L1 event to verify it has found the correct propose calldata. These hashes
are always required.

### Multicall3 Decoding with Hash Matching

First attempt to decode the transaction as a multicall3 `aggregate3` call:

- Check if transaction is to multicall3 address (`0xcA11bde05977b3631167028862bE2a173976CA11`)
- Decode as `aggregate3(Call3[] calldata calls)`
- Find all calls matching the rollup contract address and the `propose` function selector
- Verify each candidate by computing `attestationsHash` (keccak256 of ABI-encoded attestations)
  and `payloadDigest` (keccak256 of the consensus payload signing hash) and comparing against
  expected values from the `CheckpointProposed` event
- Return the verified candidate (if multiple verify, return the first with a warning)

This approach works regardless of what other calls are in the multicall3 bundle, because hash
matching identifies the correct propose call without needing an allowlist.

### Direct Propose Call

Second attempt to decode the transaction as a direct `propose` call to the rollup contract:

- Check if transaction is to the rollup address
- Decode as `propose` function call
- Verify against expected hashes
- Return the transaction input as the propose calldata

### Spire Proposer Call

Given existing attempts to route the call via the Spire proposer, we also check if the tx is
`to` the proposer known address. If so, we extract all wrapped calls and try each as either
a multicall3 or direct propose call, using hash matching to find and verify the correct one.

Since the Spire proposer is upgradeable, we check that the implementation has not changed in
order to decode. Any validation failure triggers fallback to the next step.

### Debug and Trace Transaction Fallback

Last, we use L1 node's trace/debug RPC methods to definitively identify the one successful
`propose` call within the tx. We can then extract the exact calldata that hit the `propose`
function in the rollup contract.

This approach requires access to a debug-enabled L1 node, which may be more resource-intensive,
so we only use it as a fallback when earlier steps fail, which should be rare in practice.
