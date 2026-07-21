# BatchTxRequester

The `BatchTxRequester` is a specialized P2P service that aggressively fetches missing transactions from peers when a node lacks some of the referenced transactions. It serves two pathways: (1) block proposals, where validators need all transactions to attest, and (2) block proving, where provers need all transactions to generate proofs.

## Overview

When a validator receives a block proposal or a prover needs to prove a block, they must have all transactions. If some transactions are missing from the local mempool (e.g., due to gossip delays), the `BatchTxRequester` kicks in to fetch them via direct peer-to-peer requests before the deadline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Block Proposal or Block Received                       │
│                     (contains hashes of N transactions)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │   Check local mempool for txs   │
                    └─────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                 ┌─────────────────┐
          │   All txs found │                 │  Missing M txs  │
          │   → Attest now  │                 │                 │
          └─────────────────┘                 └─────────────────┘
                                                       │
                                                       ▼
                                    ┌───────────────────────────────┐
                                    │      BatchTxRequester.run()   │
                                    │   Fetch missing txs until     │
                                    │   deadline or all collected   │
                                    └───────────────────────────────┘
```

## Architecture

### Peer Classification

The requester classifies peers into three categories to optimize fetching:

```
                              ┌─────────────────────────────┐
                              │        All Known Peers      │
                              └─────────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │   Pinned Peer   │          │   Dumb Peers    │          │   Smart Peers   │
    │                 │          │                 │          │                 │
    │ The peer who    │          │ Peers we query  │          │ Peers that have │
    │ sent us the     │          │ blindly - we    │          │ told us which   │
    │ block proposal. │          │ don't know what │          │ txs they have   │
    │ Should have ALL │          │ txs they have.  │          │ via BitVector   │
    │ transactions.   │          │                 │          │ responses.      │
    └─────────────────┘          └─────────────────┘          └─────────────────┘
           │                            │                            │
           │                            │                            │
           ▼                            ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │ Queried in      │          │ Queried with    │          │ Queried with    │
    │ dedicated loop, │          │ full tx hashes  │          │ BitVector only  │
    │ prioritizes     │          │ (peer may not   │          │ (peer has the   │
    │ least-requested │          │ have proposal)  │          │ block proposal) │
    │ transactions    │          │                 │          │                 │
    └─────────────────┘          └─────────────────┘          └─────────────────┘
```

### Blind Phase → Smart Phase Transition

Peers transition from "dumb" to "smart" when they respond with a valid `BlockTxsResponse` containing:
1. A matching `archiveRoot`
2. A non-empty `txIndices` BitVector indicating which transactions they have
3. At least one transaction we're still missing

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BLIND PHASE                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Initial State: All peers are "dumb" (except pinned peer)              │  │
│  │                                                                        │  │
│  │  Request: [archiveRoot, txHashes (full list), txIndices (BitVector)]   │  │
│  │           └─ Include full hashes because peer may not have proposal    │  │
│  │                                                                        │  │
│  │  Response: [archiveRoot, txs[], txIndices (what peer has)]             │  │
│  │            └─ Tells us exactly which txs this peer can provide         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Peer responds with valid txIndices
                                      │ AND has txs we're missing
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SMART PHASE                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Peer promoted to "smart" - we know exactly what they have             │  │
│  │                                                                        │  │
│  │  Request: [archiveRoot, txIndices (BitVector only)]                    │  │
│  │           └─ No need for full hashes, peer has the proposal            │  │
│  │                                                                        │  │
│  │  Response: [archiveRoot, txs[], txIndices (updated availability)]      │  │
│  │            └─ May have received more txs since last response           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Concurrent Worker Architecture

The `BatchTxRequester` runs three types of workers concurrently:

```
                         ┌─────────────────────────────────────┐
                         │         BatchTxRequester.run()      │
                         │                                     │
                         │  ┌─────────────────────────────┐    │
                         │  │    txQueue (FifoMemoryQueue)│◄───┼──── Yields Tx objects
                         │  └─────────────────────────────┘    │     to caller
                         └─────────────────────────────────────┘
                                          ▲
                                          │ put(tx)
           ┌──────────────────────────────┼────────────────────────────┐
           │                              │                            │
           │                              │                            │
┌──────────┴──────────┐       ┌───────────┴─────────┐       ┌──────────┴──────────┐
│ pinnedPeerRequester │       │    dumbRequester    │       │   smartRequester    │
│                     │       │                     │       │                     │
│ Single dedicated    │       │ N parallel workers  │       │ M parallel workers  │
│ loop for pinned     │       │ (default: 10)       │       │ (default: 10)       │
│ peer                │       │                     │       │                     │
│                     │       │ Round-robin through │       │ Wait on semaphore   │
│ Prioritizes txs     │       │ available dumb      │       │ until peers become  │
│ that have been      │       │ peers               │       │ smart               │
│ requested least     │       │                     │       │                     │
└─────────────────────┘       └─────────────────────┘       └─────────────────────┘
           │                              │                              │
           └──────────────────────────────┼──────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │    requestTxBatch()   │
                              │                       │
                              │  sendRequestToPeer()  │
                              │  via libp2p ReqResp   │
                              └───────────────────────┘
```

## Wire Protocol

### BlockTxsRequest

```typescript
class BlockTxsRequest {
  archiveRoot: Fr;         // Archive root after the proposed block is applied
  txHashes: TxHashArray;   // Full tx hashes (for dumb peers without proposal)
  txIndices: BitVector;    // Which txs from proposal we're requesting (1 = want)
}
```

### BlockTxsResponse

```typescript
class BlockTxsResponse {
  archiveRoot: Fr;         // Echo back the proposal archive root
  txs: TxArray;            // Actual transaction data
  txIndices: BitVector;    // Which txs the peer has available (1 = have)
}
```

The `BitVector` is a compact representation where each bit corresponds to a transaction index in the block proposal. This allows efficient capability advertisement without repeating full hashes.

## Cancellation

All cancellation is managed by a single `RequestTracker` instance, shared across the entire collection
flow. The `RequestTracker` owns the deadline, tracks which txs are still missing, and exposes a
`cancellationToken` promise that resolves when the request should stop (deadline hit, all txs fetched,
or external `cancel()` call).

Cancellation propagates from the deepest stack level upward:

```
RequestTracker.finish()
  ├── resolves cancellationToken promise
  │
  ├── BatchTxRequester workers (deepest)
  │     ├── shouldStop() checks requestTracker.cancelled → exit loop
  │     ├── sleepClampedToDeadline races sleep vs cancellationToken → wakes
  │     └── semaphore.acquire races vs cancellationToken → wakes
  │           │
  │           ▼ workers settle → txQueue.end() → generator returns
  │
  ├── Node collection loops
  │     ├── notFinished() checks requestTracker.cancelled → exit loop
  │     └── inter-retry sleep races vs cancellationToken → wakes
  │           │
  │           ▼ all node loops settle
  │
  └── collectFast (outermost)
        awaits Promise.allSettled([reqresp, nodes]) → settles after inner tasks
        finally: requestTracker.cancel() (idempotent), cleanup
```

## Key Files

| File | Description |
|------|-------------|
| `batch_tx_requester.ts` | Main orchestrator with worker loops |
| `missing_txs.ts` | Tracks metadata for each missing tx (request count, in-flight status, which peers have it) |
| `peer_collection.ts` | Manages peer classification (dumb/smart/bad) and rate limiting |
| `interface.ts` | Type definitions for dependencies |
| `../protocols/block_txs/` | Wire protocol definitions (`BlockTxsRequest`, `BlockTxsResponse`, `BitVector`) |
| `../../tx_collection/request_tracker.ts` | Centralized deadline, missing tx tracking, and cancellation signal |

## Stopping Conditions

The `BatchTxRequester` stops when any of these conditions are met, all managed by the `RequestTracker`:

1. **All transactions fetched** - `markFetched()` removes the last missing tx, triggering `finish()`
2. **Deadline exceeded** - `setTimeout` in `RequestTracker` fires, triggering `finish()`
3. **External cancellation** - `RequestTracker.cancel()` called (e.g., from `stop()`, `stopCollectingForBlocksUpTo`)
4. **No transactions to fetch** - Empty hash set at construction, `RequestTracker` finishes immediately

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `batchTxRequesterSmartParallelWorkerCount` | 10 | Max concurrent requests to smart peers |
| `batchTxRequesterDumbParallelWorkerCount` | 10 | Max concurrent requests to dumb peers |
| `batchTxRequesterTxBatchSize` | 8 | Max transactions per request |
| `batchTxRequesterBadPeerThreshold` | 2 | Penalties before marking peer as bad (see > threshold logic) |
| `RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL` | 1000ms | Cooldown after rate limit hit |

## Error Handling

### Peer States

- **Bad Peer**: After `batchTxRequesterBadPeerThreshold` penalties, peer is excluded from queries
- **Bad Peer Penalties**: A penalty is applied on `FAILURE`/`UNKNOWN` responses or when transaction validation fails
- **Rate Limited**: On `RATE_LIMIT_EXCEEDED` response, peer is temporarily excluded
- **Redemption**: A peer is removed from the bad set only after a successful response with all transactions valid (this clears the penalty counter)
- **Peer Scoring**: Each penalty is forwarded to the injected `peerScoring` service with a severity

### Failure Recovery

```
Request to peer fails
        │
        ├── RATE_LIMIT_EXCEEDED → Mark peer rate-limited, sleep, retry later
        │
        ├── FAILURE/UNKNOWN → Penalise peer (severity), increment penalty counter
        │                     │
        │                     ├── Counter < threshold → Continue querying
        │                     │
        │                     └── Counter ≥ threshold → Exclude peer
        │
        └── SUCCESS → Process response, if all transactions are valid clear penalties
```

## Usage Example

```typescript
const requestTracker = RequestTracker.create(
  missingTxHashes,                          // TxHash[] - what we need
  new Date(Date.now() + 5_000),             // deadline
);

const requester = new BatchTxRequester(
  requestTracker,       // IRequestTracker - tracks missing txs, deadline, and cancellation
  blockTxsSource,       // BlockTxsSource - the proposal or block we need txs for
  pinnedPeer,           // PeerId | undefined - peer expected to have the txs
  p2pService,           // BatchTxRequesterLibP2PService
);

// Async generator yields transactions as they arrive
for await (const tx of requester.run()) {
  // Process each transaction as it's fetched and validated
  mempool.addTx(tx);
}

// Or collect all at once
const txs = await BatchTxRequester.collectAllTxs(requester.run());
```

## Integration with Broader Codebase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                P2PClient                                    │
│                                                                             │
│  Receives block proposals via gossipsub                                     │
│  Triggers transaction collection when needed                                │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TxCollection                                   │
│                                                                             │
│  Coordinates Fast and Slow collection strategies                            │
│  Manages lifecycle of collection requests                                   │
└───────────────────┬─────────────────────────────────┬───────────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────┐   ┌─────────────────────────────────────┐
│        FastTxCollection           │   │         SlowTxCollection            │
│                                   │   │                                     │
│  Time-critical: proposals/proving │   │  Background: unproven blocks        │
│                                   │   │                                     │
│  1. Try RPC nodes first (fast)    │   │  Periodic polling of RPC nodes      │
│  2. Fall back to BatchTxRequester │   │  and peers for missing txs          │
│                                   │   │                                     │
│  Creates RequestTracker per       │   │                                     │
│  request with deadline            │   │                                     │
└───────────────────┬───────────────┘   └─────────────────────────────────────┘
                    │
                    │ For 'proposal' and 'block' requests
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BatchTxRequester                                  │
│                                                                             │
│  Aggressive parallel fetching from multiple peers                           │
│  Shares RequestTracker with FastTxCollection for unified cancellation       │
│  Uses BLOCK_TXS sub-protocol for efficient batching                         │
└───────────────────┬─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ReqResp (libp2p)                                    │
│                                                                             │
│  Low-level stream management                                                │
│  sendRequestToPeer() → opens stream → sends request → awaits response       │
└───────────────────┬─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    reqRespBlockTxsHandler (on peer)                         │
│                                                                             │
│  1. Parse BlockTxsRequest                                                   │
│  2. Look up block proposal in AttestationPool                               │
│  3. Check TxPool for available transactions                                 │
│  4. Build BitVector of available tx indices                                 │
│  5. Return BlockTxsResponse with txs + availability info                    │
└─────────────────────────────────────────────────────────────────────────────┘
```
