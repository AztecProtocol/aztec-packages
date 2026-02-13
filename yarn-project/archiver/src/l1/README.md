# Archiver L1 Data Retrieval

Modules and classes to handle data retrieval from L1 for the archiver.

## Calldata Retriever

The sequencer publisher bundles multiple operations into a single multicall3 transaction for gas
efficiency. A typical transaction includes:

1. Attestation invalidations (if needed): `invalidateBadAttestation`, `invalidateInsufficientAttestations`
2. Block proposal: `propose` (exactly one per transaction to the rollup contract)
3. Governance and slashing (if needed): votes, payload creation/execution

The archiver needs to extract the `propose` calldata from these bundled transactions to reconstruct
L2 blocks. This class needs to handle scenarios where the transaction was submitted via multicall3,
as well as alternative ways for submitting the `propose` call that other clients might use.

### Multicall3 Validation and Decoding

First attempt to decode the transaction as a multicall3 `aggregate3` call with validation:

- Check if transaction is to multicall3 address (`0xcA11bde05977b3631167028862bE2a173976CA11`)
- Decode as `aggregate3(Call3[] calldata calls)`
- Allow calls to known addresses and methods (rollup, governance, slashing contracts, etc.)
- Find the single `propose` call to the rollup contract
- Verify exactly one `propose` call exists
- Extract and return the propose calldata

This step handles the common case efficiently without requiring expensive trace or debug RPC calls.
Any validation failure triggers fallback to the next step.

### Direct Propose Call

Second attempt to decode the transaction as a direct `propose` call to the rollup contract:

- Check if transaction is to the rollup address
- Decode as `propose` function call
- Verify the function is indeed `propose`
- Return the transaction input as the propose calldata

This handles scenarios where clients submit transactions directly to the rollup contract without
using multicall3 for bundling. Any validation failure triggers fallback to the next step.

### Spire Proposer Call

Given existing attempts to route the call via the Spire proposer, we also check if the tx is `to` the 
proposer known address, and if so, we try decoding it as either a multicall3 or a direct call to the
rollup contract.

Similar as with the multicall3 check, we check that there are no other calls in the Spire proposer, so
we are absolutely sure that the only call is the successful one to the rollup. Any extraneous call would
imply an unexpected path to calling `propose` in the rollup contract, and since we cannot verify if the
calldata arguments we extracted are the correct ones (see the section below), we cannot know for sure which
one is the call that succeeded, so we don't know which calldata to process.

Furthermore, since the Spire proposer is upgradeable, we check if the implementation has not changed in
order to decode. As usual, any validation failure triggers fallback to the next step.

### Relaxed Hash-Verified Extraction (Multicall3)

When strict multicall3 validation fails (e.g., due to unrecognized calls from new contract interactions),
the retriever attempts a relaxed hash-verified extraction before falling back to trace:

1. **Strict first**: All calls must be on the allowlist. If this passes, the single propose call is returned immediately.
2. **Relaxed second**: If strict fails and both `attestationsHash` and `payloadDigest` are available from the
   `CheckpointProposed` event:
   - Filter candidate `propose` calls by matching both target address (rollup) and function selector (`propose`).
   - Verify each candidate's calldata by computing `attestationsHash` (keccak256 of ABI-encoded attestations)
     and `payloadDigest` (keccak256 of the consensus payload signing hash) and comparing against expected values.
   - Return the uniquely verified candidate (exactly one must match).
   - If zero or multiple candidates verify, return undefined and fall back to trace.
3. **Requirements**: Relaxed mode requires **both** hashes to be present. If only one hash is available (or neither),
   relaxed mode is skipped entirely and behavior remains backwards-compatible (falls through to trace).

Note: `decodeAndBuildCheckpoint` continues to perform final hash validation after extraction. The extraction-time
verification is an optimization to avoid expensive `debug_traceTransaction` / `trace_transaction` RPC calls.

This approach also applies to multicall3 transactions wrapped by Spire Proposer.

### Debug and Trace Transaction Fallback

Last, we use L1 node's trace/debug RPC methods to definitively identify the one successful `propose` call within the tx.
We can then extract the exact calldata that hit the `propose` function in the rollup contract.

This approach requires access to a debug-enabled L1 node, which may be more resource-intensive, so we only
use it as a fallback when the first step fails, which should be rare in practice.