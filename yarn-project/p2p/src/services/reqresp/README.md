# ReqResp Protocols

This module implements libp2p request-response protocols for the Aztec P2P network. All protocols share common transport-level validation (rate limiting, timeouts, Snappy decompression, error penalties) with protocol-specific logic layered on top.

## Common Transport Validation

### Rate Limiting (Responder Side)

Applied before the protocol handler runs.

| Protocol | Peer Limit | Global Limit | File |
|----------|-----------|-------------|------|
| PING | 5/s | 10/s | `rate-limiter/rate_limits.ts` |
| STATUS | 5/s | 10/s | same |
| AUTH | 5/s | 10/s | same |
| GOODBYE | 5/s | 10/s | same |
| BLOCK | 2/s | 5/s | same |
| BLOCK_TXS | 10/s | 200/s | same |
| TX | (see rate limits file) | (see rate limits file) | same |

- Per-peer limit exceeded: `HighToleranceError` penalty + `RATE_LIMIT_EXCEEDED` status. Penalty fires inside `RequestResponseRateLimiter.allow()`, not the stream handler.
- Global limit exceeded: `RATE_LIMIT_EXCEEDED` status only (no peer penalty).

### Response Status Byte (Requester Side)

| Rule | Consequence | File |
|------|-------------|------|
| First chunk must be exactly 1 byte | `ReqRespStatusError(UNKNOWN)` | `status.ts` |
| Byte must be valid `ReqRespStatus` enum (0-4, 126, 127) | `ReqRespStatusError(UNKNOWN)` | same |

Note: `prettyPrintReqRespStatus` is missing a `NOT_FOUND` case (minor logging bug).

### Snappy Decompression (Requester Side)

Per-protocol size limits checked via preamble before decompression.

### Timeouts (Requester Side)

| Timeout | Default | Penalty |
|---------|---------|---------|
| Individual request | 10s | HighToleranceError |
| Dial | 5s | HighToleranceError |

### Error Penalty Categorization (Requester Side)

| Error Type | Severity |
|------------|----------|
| GOODBYE subprotocol errors | None |
| `AbortError` / connection close / muxer closed | None |
| `ECONNRESET` / `EPIPE` / `ECONNREFUSED` / `ERR_UNEXPECTED_EOF` | HighToleranceError |
| `ERR_UNSUPPORTED_PROTOCOL` | HighToleranceError |
| `IndividualReqRespTimeoutError` / `TimeoutError` | HighToleranceError |
| Catch-all | HighToleranceError |

### Request Error Penalty (Responder Side)

| Error Type | Severity |
|------------|----------|
| `BADLY_FORMED_REQUEST` | LowToleranceError |
| All others | None |

### Notes

- Request payloads are NOT snappy-compressed (asymmetric: only responses use snappy).

---

## Handshake Protocols

### Connection-Level Gating (Before Any Handshake)

| Rule | Consequence | File |
|------|-------------|------|
| Deny inbound connection from IP/peerId with too many failed auth handshakes | Connection denied | `libp2p_service.ts` |
| Threshold: `p2pMaxFailedAuthAttemptsAllowed` (default 3) | Tracked per peerId AND per IP | `peer_manager.ts` |
| Failed auth entries expire after 1 hour | Peer can reconnect; no escalating penalty for repeat offenders | same |

### Handshake Trigger Logic (`peer:connect`)

1. `p2pDisableStatusHandshake` = true: no handshake
2. `p2pAllowOnlyValidators` = false: STATUS handshake
3. Peer is protected (trusted/private/preferred): STATUS handshake
4. Otherwise: AUTH handshake (superset of STATUS)

Config constraint: `p2pDisableStatusHandshake && p2pAllowOnlyValidators` is disallowed.

### STATUS Protocol (`/aztec/req/status/1.0.0`)

**Requester side** (`peer_manager.ts`):

| Rule | Consequence |
|------|-------------|
| Response status must be SUCCESS | Peer scheduled for disconnect |
| `compressedComponentsVersion` must match | Peer scheduled for disconnect |
| Any exception | Peer scheduled for disconnect |

`StatusMessage.validate()` currently only checks `compressedComponentsVersion`. Fields `latestBlockNumber`, `latestBlockHash`, `finalizedBlockNumber` are NOT validated (TODO in code).

**Responder side**: no validation of incoming request content (always responds with own status). This means the requester leaks its blockchain state to any peer before validation.

**Deserialization bounds**: `MAX_VERSION_STRING_LENGTH` = 64 bytes, `MAX_BLOCK_HASH_STRING_LENGTH` = 128 bytes. Expected response size: 1 KB.

### AUTH Protocol (`/aztec/req/auth/1.0.0`)

**Requester side** (`peer_manager.ts`):

| # | Rule | Consequence |
|---|------|-------------|
| 1 | Response status is SUCCESS | `markAuthHandshakeFailed` + disconnect |
| 2 | `compressedComponentsVersion` match | `markAuthHandshakeFailed` + disconnect |
| 3 | Valid ECDSA signature recovery from challenge response | `markAuthHandshakeFailed` + disconnect |
| 4 | Recovered address is a registered validator | `markAuthHandshakeFailed` + disconnect |
| 5 | Validator address not already authenticated to different peerId | Silent return (no disconnect, no failure marking -- peer stays connected but unauthenticated) |
| 6 | Any exception | `markAuthHandshakeFailed` + disconnect |

Challenge: random `Fr`, payload = `keccak256("Aztec Validator Challenge:" + challenge)`, signed with `eth_sign` style. Challenge is NOT bound to peer identity (transport encryption via Noise is the binding layer).

On success: peer added to authenticated maps, prior failures cleared (including IP-based ones -- shared-IP peers benefit from a legitimate validator's success).

**Responder side** (`validator-client/src/validator.ts` + `peer_manager.ts`):

| # | Rule | Consequence |
|---|------|-------------|
| 1 | Peer must be protected (`shouldTrustWithIdentity` in `peer_manager.ts`) | Returns empty buffer (SUCCESS status + empty payload -> requester gets parse error -> `markAuthHandshakeFailed`) |
| 2 | Node must have registered validator address | Returns empty buffer (same consequence) |

**Unauthenticated peer gossip**: when `p2pAllowOnlyValidators` is true, unauthenticated peers get `appSpecificScore = -Infinity`, completely excluding them from all gossip.

### PING Protocol (`/aztec/req/ping/1.0.0`)

No validation on either side. Responder returns `Buffer.from('pong')`. Expected response: 1 KB.

### GOODBYE Protocol (`/aztec/req/goodbye/1.0.0`)

**Responder**: buffer must be 1 byte (defaults to `UNKNOWN` on invalid length). Goodbye reason byte is NOT validated against the enum -- any byte 0-255 accepted. Peer scheduled for disconnect regardless of reason.

**Requester**: response errors are never penalized (GOODBYE subprotocol exempt from error categorization).

### Periodic Re-validation

| Rule | Interval | File |
|------|----------|------|
| Authenticated validators re-checked against current validator set | Every heartbeat (`peerCheckIntervalMS`) | `peer_manager.ts` |
| If validator address no longer registered, auth entry removed | Same | same |

Protected peers (private/trusted/preferred) are always considered "authenticated" without AUTH handshake.

---

## Block Data Protocols

### BLOCK Protocol (`/aztec/req/block/1.0.0`)

**Server side**:

| Rule | Consequence | File |
|------|-------------|------|
| Request must parse as `Fr` | `BADLY_FORMED_REQUEST` + LowToleranceError | `protocols/block.ts` |
| Block lookup throws | `INTERNAL_ERROR` status | same |
| Block not found | SUCCESS + empty buffer (design choice; no `NOT_FOUND` status used) | same |

**Requester side** (Snappy limit: 3 MB):

| Rule | Consequence | File |
|------|-------------|------|
| Response block number must match requested | LowToleranceError; rejected | `libp2p_service.ts` (`validateRequestedBlock`) |
| Local block must exist for hash verification | Rejected (no penalty) | same |
| Response block hash must equal local block hash | MidToleranceError; rejected | same |

**Limitation**: the local-block requirement means BLOCK req/resp is unusable for initial P2P-only sync (before L1 sync provides local copies for verification). A TODO in the code acknowledges this.

### BLOCK_TXS Protocol (`/aztec/req/block_txs/1.0.0`)

**Server side**:

| Rule | Consequence | File |
|------|-------------|------|
| Request must parse as `BlockTxsRequest` (Fr + TxHashArray + BitVector) | `BADLY_FORMED_REQUEST` + LowToleranceError | `protocols/block_txs/block_txs_handler.ts` |
| BitVector length: non-negative and <= `MAX_TXS_PER_BLOCK` (65536) | Deserialization throws -> `BADLY_FORMED_REQUEST` | `protocols/block_txs/bitvector.ts` |
| Archive root not found and no explicit txHashes | `NOT_FOUND` status | handler |
| Internal error during lookup | Unhandled exception -> stream abort (no `INTERNAL_ERROR` status, unlike BLOCK) | handler |

Conditional registration: BLOCK_TXS handler only registered when `config.disableTransactions` is false. Otherwise peers get `ERR_UNSUPPORTED_PROTOCOL`.

**Requester side via `BatchTxRequester`** (separate validation path):

| Rule | Consequence | File |
|------|-------------|------|
| Non-SUCCESS status: `FAILURE`/`UNKNOWN` | HighToleranceError + "bad peer" tracking | `batch-tx-requester/batch_tx_requester.ts` |
| `RATE_LIMIT_EXCEEDED` | Peer marked rate-limited (cooldown) | same |
| `NOT_FOUND` / `BADLY_FORMED_REQUEST` / `INTERNAL_ERROR` | Falls through silently (no penalty) | same |
| Each tx validated (Metadata + Size + Data + Proof) | LowToleranceError per invalid tx; valid txs from same response still accepted | same |
| Archive root match + non-empty txIndices | No penalty on mismatch; peer not promoted to "smart" | same |

**Double penalty on transport errors**: when `BatchTxRequester` encounters a transport error (e.g., ECONNRESET), both `sendRequestToPeer`'s internal handler and the `BatchTxRequester`'s catch block penalize the peer, resulting in double HighToleranceError.

See [BatchTxRequester README](batch-tx-requester/README.md) for the full architecture (peer classification, worker model, wire protocol).

### TX Protocol (`/aztec/req/tx/1.0.0`)

**Server side**:

| Rule | Consequence | File |
|------|-------------|------|
| Request must parse as `TxHashArray` | `BADLY_FORMED_REQUEST` + LowToleranceError | `protocols/tx.ts` |

**Requester side** (validator registered at startup, not the default noop):

| Rule | Consequence | File |
|------|-------------|------|
| Each returned tx hash must be in the requested set | MidToleranceError | `libp2p_service.ts` (`validateRequestedTxs`) |
| Each tx passes well-formedness (Metadata + Size + Data + Proof) | LowToleranceError | same |

Snappy limit: `max(N, 1) * 512 + 1` KB.

