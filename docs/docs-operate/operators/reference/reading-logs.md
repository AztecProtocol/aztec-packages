---
id: reading_logs
title: Reading your logs
description: A reference for common sequencer, prover, and node log messages, which are safe to ignore, and which need action.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/node-keystore/src/*", "yarn-project/p2p/src/*", "yarn-project/sequencer-client/src/*", "yarn-project/archiver/src/*", "yarn-project/prover-client/src/proving_broker/*"]
---

Node logs carry a mix of routine network noise and messages that need action. This page catalogues the ones operators see most often, grouped by subsystem, with a severity and what to do.

Severity:

- **Ignore**: routine, no action needed.
- **Investigate**: may be routine, may indicate a problem. Check the named thing before deciding.
- **Urgent**: act now. The node is not functioning correctly and rewards or stake are at risk.

This is not an exhaustive list of every log line. It covers the messages that come up most often. If you hit something not listed here, the [Aztec Discord](https://discord.com/invite/aztec) operator channels are the best place to check.

## Keystore

### `ZodError: Expected object, received array`

**Severity: Urgent.** The node will not start.

```
"issues": [ { "code": "invalid_type", "expected": "object", "received": "array", ... "message": "Expected object, received array" } ],
"name": "ZodError"
```

(usually printed twice in a row)

A file in your keystore directory is a JSON **array**, but a keystore must be a JSON **object**, for example `{ "validators": [ ... ] }`. The usual cause is that the public staker-output file (for example `key1_staker_output.json`) was copied into the keystore directory alongside the keystore. That file is an array of validator entries meant for registration, not a keystore, so the node rejects it.

**Action:** keep only your keystore file (for example `key1.json`) in the keystore directory. The `key1_staker_output.json` file belongs with your registration materials, not in the keystore directory. See [generating your keystore](/operate/operators/solo-sequencer/generate-keystore).

## P2P / networking

### `WARN ... reqresp ... err: { "code": "ERR_UNEXPECTED_EOF" }`

**Severity: Ignore.** A peer closed a request/response stream early. This is routine churn in a peer-to-peer network and does not affect your attesting or proposing. No action.

### `ERROR cli CodeError: no valid addresses were provided for transports [@libp2p/tcp]`

**Severity: Urgent.** The node cannot bind its P2P transport, so it will not start. The advertised or listen address for P2P is missing or invalid.

**Action:** set a valid P2P address in your node config and make sure the P2P port is reachable. See [the setup guide](/operate/operators/solo-sequencer/configure-environment) for the relevant variables.

### `FATAL ... Failed to start p2p service`

**Severity: Urgent.** The node will not start. Since v5.2.0 a p2p service that fails to start aborts node startup instead of leaving the node running with a dead libp2p stack. The usual cause is the TCP listener failing to bind: a port already in use, or an invalid `P2P_LISTEN_ADDR` / `P2P_PORT`.

**Action:** free or change the P2P port and restart. A node that used to run past this error was peerless and silently useless, so the hard failure is the fix, not a regression.

### `WARN ... Node has no connected peers; gossip and tx propagation are unavailable`

**Severity: Urgent.** Your node has been at zero peers for several consecutive peer-manager heartbeats. It repeats about once a minute until peers return, then logs one info line when connectivity is restored. While peerless the node will not propose checkpoints, will not file data-withholding offenses, and rejects incoming transactions. New in v5.2.0.

**Action:** check that your P2P port is reachable (`nc -zv <your-external-IP> 40400`) and that your advertised IP matches your external address. See [Sequencer troubleshooting](/operate/operators/concepts/sequencer-troubleshooting).

### `WARN ... Skipping checkpoint proposal for slot N since we have too few connected peers`

**Severity: Urgent.** You were the proposer for that slot but had fewer than `SEQ_MIN_PEERS_TO_PROPOSE` peers (default 1), so the node deliberately skipped building. New in v5.2.0.

**Action:** same as above, fix peer connectivity. Setting `SEQ_MIN_PEERS_TO_PROPOSE=0` disables the gate but does not fix the underlying isolation.

## Sequencer

### `AttestationTimeoutError: Timeout collecting attestations for slot N: X/Y`

**Severity: Investigate.** As the slot's proposer, you did not collect two-thirds of the committee's attestations in time, so that slot was missed. `X/Y` is how many attestations you collected versus how many were needed. The usual cause is that not enough of the committee's attesters were online that round.

**Action:** every timed-out slot is a block you did not produce, so you earn no reward for it. Check your own peer count and connectivity first, since a low peer count or a slow connection can keep you from collecting attestations in time. If your node is healthy and this happens across many slots, it reflects a wider network liveness condition (not enough of the committee online) rather than a problem you can fix locally. A single miss is not slashable on its own, but persistent misses cost rewards, and missing nearly all of your duties for a full epoch contributes to inactivity.

### `WARN ... Dropping N txs from mempool due to failures during block building for slot S`

**Severity: Investigate.** Since v5.2.0 every transaction the block builder removes from the local mempool is logged at warn with its per-tx `reason`, alongside `slot` and `checkpointNumber`. Before this, these drops were only visible at verbose or debug level, so transactions disappeared with no recorded cause.

**Action:** read the `failures` field for the reason. A burst of the same reason right after a reorg is expected and self-correcting. A steady trickle on a healthy chain points at transactions your node consistently rejects.

### `WARN ... Own validator 0x... targeted by slashing vote (N of Q votes needed to slash)`

**Severity: Urgent.** The network is voting to slash one of your validators, and `N` of the `Q` votes needed for quorum have been cast in this round. New in v5.2.0. A follow-up `Own validator 0x... was slashed for ...` is logged if the round executes.

**Action:** react while the round is open. Confirm your node is attesting and proposing (this is almost always inactivity), then check [Slashing](/operate/operators/concepts/slashing). The same signal is available as `aztec_slasher_own_validator_current_round_votes_max` versus `aztec_slasher_quorum_size`.

## Archiver

### `WARN archiver:validate_trace debug_traceTransaction failed for old blocks ... historical state is not available`

**Severity: Ignore for old blocks, but check your RPC.** At startup the node tries `debug_traceTransaction` against historical blocks your RPC has already pruned. This is routine for *old* blocks and the node proceeds.

This call is not optional, though: the node uses `debug_traceTransaction` to read block data when a proposal's L1 transaction has a non-standard structure, and without it the node can fail to follow the chain. So you must run a debug-capable L1 execution RPC that keeps recent history (about 12 hours, roughly 3,600 blocks). If this warning appears for *recent* blocks, your RPC cannot trace and your node is at risk of getting stuck.

**Action:** confirm your L1 execution RPC supports `debug_traceTransaction` and retains enough history. See [L1 RPC requirements](/operate/operators/concepts/l1-rpc#debug-traces) for the per-client configuration.

## Prover

### `PayloadTooLargeError: request entity too large limit: 1048576 (1 MB)`

**Severity: Investigate.** A proof payload exceeded the node's request body limit, so it was rejected. Seen on prover broker and agent setups.

**Action:** raise the body-size limit with the `RPC_MAX_BODY_SIZE` environment variable. See [Claiming prover rewards](/operate/operators/prover/claiming-rewards) and the [prover setup guide](/operate/operators/prover/setup).

## See also

- [L1 RPC requirements](/operate/operators/concepts/l1-rpc): execution, consensus, and debug endpoints your node needs
- [Monitoring](/operate/operators/monitoring): metrics and alerts so you see problems before the logs do
- [Slashing](/operate/operators/concepts/slashing): what actually puts stake at risk
