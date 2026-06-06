# P2P

This package implements the P2P networking layer for Aztec nodes using libp2p. It handles transaction propagation, block and checkpoint proposal dissemination, attestation collection for consensus, and peer management. The `P2PClient` provides the top-level interface used by `aztec-node`; the `BootstrapNode` class runs a lightweight discovery-only node that introduces peers to the network without participating in gossip.

## Architecture

- **P2PClient** wraps everything below. Manages lifecycle, bridges L2 block events to pool state transitions, exposes `ITxProvider` for RPC.
- **LibP2PService** is the core networking layer. Subscribes to gossipsub topics, registers req/resp handlers, runs message validation pipelines. It composes:
  - **PeerManager** — peer scoring (gossipsub + application-level), authentication (STATUS/AUTH handshakes), connection gating.
  - **DiscV5Service** — UDP-based peer discovery using Ethereum's discv5 protocol and ENR records.
  - **ReqResp** — request-response protocols: BLOCK, BLOCK_TXS, TX, STATUS, AUTH, PING, GOODBYE.
  - **TxCollection** — coordinates transaction fetching: fast collection for proposals/proving (deadline-driven, falls back to `BatchTxRequester`) and slow background collection for unproven blocks.
- **Mempools** sit below the service layer:
  - **TxPoolV2** — transaction mempool with explicit state machine (pending, protected, mined, soft-deleted, hard-deleted) and pluggable eviction rules.
  - **AttestationPool** — stores block/checkpoint proposals and attestations per slot. Handles equivocation detection and slash callbacks.

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **P2PClient** | Top-level orchestrator. Manages lifecycle, bridges L2 block events to pool state transitions, exposes `ITxProvider` for RPC. |
| **LibP2PService** | Core networking. Subscribes to gossipsub topics, registers req/resp handlers, runs message validation pipelines. |
| **PeerManager** | Peer scoring (gossipsub + application-level), authentication (STATUS/AUTH handshakes), connection gating. |
| **DiscV5Service** | UDP-based peer discovery using Ethereum's discv5 protocol and ENR records. |
| **TxCollection** | Coordinates transaction fetching: fast collection for proposals/proving (deadline-driven, falls back to `BatchTxRequester`) and slow background collection for unproven blocks. |
| **BatchTxRequester** | Aggressive parallel fetching of missing txs from peers via BLOCK_TXS protocol. Classifies peers as pinned/dumb/smart for efficient batching. |
| **TxPoolV2** | Transaction mempool with explicit state machine (pending, protected, mined, soft-deleted, hard-deleted) and pluggable eviction rules. |
| **AttestationPool** | Stores block/checkpoint proposals and attestations per slot. Handles equivocation detection and slash callbacks. |

### Peer Lifecycle

```
Unknown → [DiscV5 discovery] → Discovered → [TCP connect] → Connected
  → [STATUS or AUTH handshake] → Authenticated → [gossip participation] → Active
```

Handshake type depends on config:
- `p2pAllowOnlyValidators` = true and peer is not protected: **AUTH** handshake (signature challenge proving validator identity). Unauthenticated peers get `appSpecificScore = -Infinity`, excluding them from all gossip.
- Otherwise: **STATUS** handshake (version compatibility check only).
- Protected peers (trusted/private/preferred): STATUS only, always considered authenticated.

Connection gating: peers with too many failed AUTH attempts (`p2pMaxFailedAuthAttemptsAllowed`, default 3) are denied inbound connections for 1 hour.

---

## Sub-module Documentation

| README | Covers |
|--------|--------|
| [Gossipsub Scoring](src/services/gossipsub/README.md) | P1-P4 parameter calculation, decay mechanics, convergence math, global thresholds, application-level penalties, tuning guidelines |
| [Transaction Validation](src/msg_validators/tx_validator/README.md) | Validator factories per entry point, individual validator descriptions with benchmarks, coverage table |
| [Proposal Validation](src/msg_validators/proposal_validator/README.md) | BlockProposal and CheckpointProposal gossipsub validation, pool admission, validator-client processing, slashing |
| [Attestation Validation](src/msg_validators/attestation_validator/README.md) | CheckpointAttestation gossipsub validation, pool admission, equivocation detection, L1 submission validation |
| [ReqResp Protocols](src/services/reqresp/README.md) | Handshake protocols (STATUS, AUTH, PING, GOODBYE), block data protocols (BLOCK, BLOCK_TXS, TX), rate limits, transport validation |
| [BatchTxRequester](src/services/reqresp/batch-tx-requester/README.md) | Peer classification (pinned/dumb/smart), worker architecture, BLOCK_TXS wire protocol |
| [TxPool Interface](src/mem_pools/tx_pool/README.md) | TxPool contract, storage structure, priority system, nullifier deduplication, eviction rules |
| [TxPoolV2](src/mem_pools/tx_pool_v2/README.md) | State machine, soft deletion (slot-based vs prune-based), pre-add vs post-event rules |

---

## Gossipsub Objects

All gossipsub messages pass through a shared pre-validation pipeline before topic-specific logic:

| Stage | Rule | Consequence | File |
|-------|------|-------------|------|
| 0 | Snappy decompressed size <= per-topic limit (see per-object sections) | Message dropped | `p2p/src/services/encoding.ts` |
| 1 | P2PMessage envelope deserializes | REJECT + LowToleranceError | `p2p/src/services/libp2p/libp2p_service.ts` |
| 2 | Gossipsub-level message cache dedup (configurable `seenTTL`) | Silently dropped by gossipsub | gossipsub internals |
| 3 | Application-level dedup via `MessageSeenValidator` (fixed-size circular buffer + Set) | IGNORE | `p2p/src/msg_validators/msg_seen_validator/` |

A REJECT result from any validation stage increments the gossipsub P4 (invalidMessageDeliveries) counter for the peer on that topic. P4 weight is -20, decaying over 4 slots. This is in addition to any application-level peer penalty.

### Peer Penalty Severity Reference

| Severity | Approx. strikes to ban | Used for |
|----------|------------------------|----------|
| `LowToleranceError` | ~2 | Invalid proof, deserialization failure, old double-spend |
| `MidToleranceError` | ~10 | Most validation failures (metadata, data, gas, phases, size) |
| `HighToleranceError` | ~50 | Timestamp expiry, block header, recent double-spend, rate limits |

See [Gossipsub Scoring](src/services/gossipsub/README.md) for full score calculation, decay mechanics, and threshold alignment.

### Object Summary

| Topic | Snappy Limit | Description | Detailed Docs |
|-------|-------------|-------------|---------------|
| `tx` | 512 KB | Transactions. Two-stage validation: fast validators (parallel) then proof verification. Pool pre-check between stages avoids wasting CPU on proof for txs the pool would reject. | [Tx Validation](src/msg_validators/tx_validator/README.md) |
| `block_proposal` | 10 MB | Block proposals from proposers. Validated for slot timing, signature, proposer identity, tx hash integrity. Validator nodes may re-execute and slash on state mismatch. | [Proposal Validation](src/msg_validators/proposal_validator/README.md) |
| `checkpoint_proposal` | 10 MB | Checkpoint proposals containing the final block. Same proposal validation as blocks, plus embedded block extraction and separate validation. | [Proposal Validation](src/msg_validators/proposal_validator/README.md) |
| `checkpoint_attestation` | 5 KB | Validator attestations for checkpoints. Validated for slot timing, attester/proposer signatures, committee membership. Equivocation at count=2 triggers slash callback. | [Attestation Validation](src/msg_validators/attestation_validator/README.md) |

---

## ReqResp Protocols

See [ReqResp Protocols](src/services/reqresp/README.md) for full protocol details.

### Rate Limits (Responder Side)

| Protocol | Peer Limit | Global Limit |
|----------|-----------|-------------|
| PING | 5/s | 10/s |
| STATUS | 5/s | 10/s |
| AUTH | 5/s | 10/s |
| GOODBYE | 5/s | 10/s |
| BLOCK | 2/s | 5/s |
| BLOCK_TXS | 10/s | 200/s |
| TX | (see config) | (see config) |

Per-peer limit exceeded: `HighToleranceError` + `RATE_LIMIT_EXCEEDED` status. Global limit exceeded: `RATE_LIMIT_EXCEEDED` status only (no peer penalty).

### Peer Score Thresholds

| Score | State | Action |
|-------|-------|--------|
| > -50 | Healthy | Normal |
| -100 < score <= -50 | Disconnect | GOODBYE sent + disconnect on next heartbeat |
| <= -100 | Banned | GOODBYE sent + disconnect on next heartbeat; ban persisted for `P2P_PEER_BAN_DURATION_SECONDS` (default 24h) |

Once a peer is banned its score is pinned at the ban level for the configured duration (it does not decay-recover),
the ban is persisted across restarts, and only lifts when the window expires. See [Gossipsub Scoring](src/services/gossipsub/README.md#ban-persistence) for details.

### Protocol Summary

| Protocol | Request | Response | Purpose |
|----------|---------|----------|---------|
| STATUS | Own blockchain state | Peer's blockchain state | Version compatibility check on connect |
| AUTH | Random challenge (`Fr`) | Signed challenge response | Validator identity verification on connect |
| PING | (empty) | `pong` | Liveness check |
| GOODBYE | Reason byte | (none meaningful) | Graceful disconnect |
| BLOCK | Block number (`Fr`) | Block data (3 MB snappy) | Block sync |
| BLOCK_TXS | Archive root + tx hashes + BitVector | Txs + BitVector of availability | Batch tx fetching for proposals/proving |
| TX | `TxHashArray` | Matching txs | Individual tx fetching |

Request payloads are NOT snappy-compressed (asymmetric: only responses use snappy).
