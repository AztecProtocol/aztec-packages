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
using multicall3 for bundling. Any validation failure triggers fallback to the last step.

### Verifying Multicall3 Arguments

**This is NOT implemented for simplicity's sake**

If the checks above don't hold, such as when there are multiple calls to `propose`, then we cannot
reliably extract the `propose` calldata from the multicall3 arguments alone. We can try a best-effort
where we try all `propose` calls we see and validate them against on-chain data. Note that we can use these
same strategies if we were to obtain the calldata from another source.

#### TempBlockLog Verification

Read the stored `TempBlockLog` for the L2 block number from L1 and verify it matches our decoded header hash,
since the `TempBlockLog` stores the hash of the proposed block header, the payload commitment, and the attestations.

However, `TempBlockLog` is only stored temporarily and deleted after proven, so this method only works for recent
blocks, not for historical data syncing.

#### Archive Verification

Verify that the archive root in the decoded propose is correct with regard to the block header. This requires
hashing the block header we have retrieved, inserting it into the archive tree, and checking the resulting root
against the one we got from L1.

However, this requires that the archive keeps a reference to world-state, which is not the case in the current
system.

#### Emit Commitments in Rollup Contract

Modify rollup contract to emit commitments to the block header in the `L2BlockProposed` event, allowing us to easily
verify the calldata we obtained vs the emitted event.

However, modifying the rollup contract is out of scope for this change. But we can implement this approach in `v2`.

### Debug and Trace Transaction Fallback

Last, we use L1 node's trace/debug RPC methods to definitively identify the one successful `propose` call within the tx.
We can then extract the exact calldata that hit the `propose` function in the rollup contract.

This approach requires access to a debug-enabled L1 node, which may be more resource-intensive, so we only
use it as a fallback when the first step fails, which should be rare in practice.