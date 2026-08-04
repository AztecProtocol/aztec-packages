---
id: l1-rpc
title: L1 RPC requirements
description: What kind of Ethereum L1 endpoint an Aztec node needs, why a blob-serving consensus client is required, how much RPC load a node generates, and how to avoid the most common L1-side failures.
displayed_sidebar: operatorsSidebar
---

Every Aztec node needs L1 access through **three endpoints**, all of which can point at the same Ethereum node:

| Endpoint | Env var | What it does for Aztec |
|---|---|---|
| **Execution RPC** | `ETHEREUM_HOSTS` | Reads Rollup-contract state, submits proposals and attestations, queries gas prices. |
| **Consensus (beacon) RPC** | `L1_CONSENSUS_HOST_URLS` | Serves blob data (the transaction data Aztec posts to Ethereum as blobs). Must serve blob sidecars, see below. |
| **Debug/trace RPC** | `ETHEREUM_DEBUG_HOSTS` | Extracts `propose()` calldata from L1 transactions via `debug_traceTransaction`. Many hosted RPCs do not offer trace methods. |

The execution and debug endpoints are often the same URL when you self-host, because a full Geth, Nethermind, Besu, or Erigon node serves both. Hosted RPCs frequently separate or omit the trace methods, which is the second most common reason a hosted endpoint does not work (the first is the blob requirement below).

## The blob-serving consensus client

Your consensus client must serve **blob sidecars**. After Ethereum's Fusaka upgrade (PeerDAS), a regular beacon node no longer serves the blob sidecar endpoint at all: blobs are distributed as erasure-coded data columns, and only a node configured to hold the full set can answer a blob request. Aztec posts its transaction data as blobs and reads it back through this endpoint, so a node pointed at a non-serving beacon falls behind and cannot sync.

Two configurations serve blobs:

- **Supernode**: holds the full set of data columns. Always serves blob sidecars.
- **Semi-supernode**: holds enough columns to reconstruct blobs. Sufficient for an Aztec node and lighter on bandwidth and storage than a full supernode.

Run one of these. For example, you can run **Lighthouse v8.0.0 or later** with `--super-node` or `--semi-supernode`, or **Prysm v7.10 or later** with `--super-node` or `--semi-supernode`. These are the versions that introduced the flags.

:::warning Symptom of a non-serving beacon
On startup the node logs a blob-source summary. A line like `consensusSuperNodes=0 ... consensus client(s) ignored because they are not running in supernode or semi-supernode mode` means your beacon is reachable but does not serve blobs. The node will not sync from it. Reconfigure the beacon with one of the flags above.
:::

If you cannot run a blob-serving beacon yourself, the node can fall back to a blob archive or a shared blob store; see [Blob retrieval](/operate/operators/setup/blob_storage) and [Syncing best practices](/operate/operators/setup/syncing_best_practices).

## Debug traces

The node uses `debug_traceTransaction` to recover proposal data in some cases (see below), so a trace-capable execution endpoint that retains about the **last 12 hours (roughly 3,600 blocks)** of history is required.

`ETHEREUM_DEBUG_HOSTS` is optional. When it is unset, the node uses your `ETHEREUM_HOSTS` execution RPC for trace calls, so a self-hosted node that already serves `debug` methods needs nothing extra. Set `ETHEREUM_DEBUG_HOSTS` separately only when your execution RPC does not serve trace methods and you have a different endpoint that does (for example, a hosted execution RPC paired with a separate archive provider).

The node normally reads a proposal's data straight from its L1 transaction. When a proposal's transaction has a non-standard structure, the node falls back to `debug_traceTransaction` to recover the data. Without a debug-capable RPC that holds recent history, the node can fail to follow the chain. This is also why a node syncing from a snapshot needs trace history back to that snapshot.

Whether you need to change anything depends on the client and its sync mode. A Reth full node and any archive node serve this window with no extra configuration; other clients prune historical state too aggressively by default and need the history window set explicitly:

| Client | Configuration for ~3,600 blocks of trace history |
|---|---|
| **Geth** | Full and snap sync keep only 128 blocks and cannot be configured higher without an archive node. Use an archive node or a hosted RPC instead. |
| **Nethermind** | Set `Pruning.FullPruningTrigger=StateDbSize` and `Pruning.FullPruningThresholdMb` to at least `256000` (256 GB). |
| **Besu** | `--bonsai-historical-block-limit=3600` (default is 512). |
| **Reth** | Full node keeps 10,064 blocks, no action needed. On a pruned node, set prune `distance = 3600` for `sender_recovery`, `transaction_lookup`, `receipts`, `account_history`, `storage_history`, and `bodies`. |
| **Erigon** | `--prune.distance 3600 --prune.distance.blocks 3600`. A minimal node cannot be configured for this; use another client or a hosted RPC. |

If you use a hosted provider, Infura, QuickNode, and Alchemy all support `debug_traceTransaction`, though it may sit behind a higher paid tier.

## How much RPC load a node generates

Aztec polls L1 continuously, which is why a free hosted RPC tier usually rate-limits a node off the chain within minutes.

The baseline is the archiver poll loop. By default it calls `eth_blockNumber` every **500 ms** (`ARCHIVER_POLLING_INTERVAL_MS`), backed by a viem cache refreshed every **1000 ms** (`ARCHIVER_VIEM_POLLING_INTERVAL_MS`). That floor is roughly:

- **~2 calls per second**, about **7,200 per hour** and **170,000 per day**, just to track the chain tip, per node.

On top of that floor, each new L1 block triggers heavier reads: log queries for rollup events, a `debug_traceTransaction` on each `propose()` to recover calldata, an `eth_getBlockByHash`, and one or more beacon blob-sidecar fetches. The execution-and-debug load scales with L1 block rate (one pass per ~12-second L1 block), not with how many sequencers you run, because one node archives the chain once regardless of how many attester identities it holds. The publisher side scales with how often one of your attesters is selected to propose: each proposal is an L1 transaction your publisher sends. Attestations are not separate L1 transactions; they are gossiped over P2P and bundled by the proposer into the proposal calldata, so they cost your publisher no L1 gas.

For the per-method breakdown by node component, see the [Ethereum RPC call reference](/operate/operators/reference/ethereum_rpc_reference).

## Self-hosted vs hosted RPC

Most production operators self-host their L1 endpoints:

- A blob-serving beacon plus trace methods is hard to find on hosted tiers, and the tiers that offer both are priced for sustained load.
- Free and low tiers rate-limit a node off the chain, and falling behind the tip is a slashable inactivity condition.
- Self-hosting once gives predictable cost and unlimited polling.

The minimum self-hosted setup is one execution client (Geth, Nethermind, Besu, or Erigon) plus one consensus client (Lighthouse or Prysm) running with a blob-serving flag. Both can share the machine with the Aztec node if you have the disk: Ethereum state plus beacon data add several hundred GB on top of the Aztec footprint. See [Hardware](./hardware) for the disk-growth caveat.

For installers and helper scripts that set up an execution plus consensus client with the right flags, see [Operator tooling](/operate/operators/tooling).

If you do use a hosted provider, confirm it offers all three: a blob-serving beacon API (`/eth/v1/beacon/blob_sidecars/{block_id}`), execution RPC, and `debug`/`trace` method support.

## Tuning polling intervals

The defaults suit a self-hosted RPC. On a rate-limited hosted RPC, raise the archiver intervals to cut call volume:

```
ARCHIVER_POLLING_INTERVAL_MS=1000
ARCHIVER_VIEM_POLLING_INTERVAL_MS=2000
```

Raising the interval trades tip-detection latency for fewer calls. The maximum observed delay for a new block is `ARCHIVER_VIEM_POLLING_INTERVAL_MS + ARCHIVER_POLLING_INTERVAL_MS`, so the values above push worst-case detection to about 3 seconds, still within slot timing. If you are seeing 429s, the more reliable fix is to self-host.

## The most common L1-side errors

| Error / symptom | Likely cause |
|---|---|
| Blob-source summary shows `consensusSuperNodes=0` | Beacon client is not serving blob sidecars; restart it with a supernode or semi-supernode flag. |
| Archiver stuck, blob fetch failures | Same as above, or no blob archive fallback configured. |
| Archiver fails to start, complains about debug/trace | The execution RPC does not expose `debug`/`trace` methods. Use a node that does, or a hosted tier that offers them. |
| `429 Too Many Requests` | RPC rate-limited; raise `ARCHIVER_POLLING_INTERVAL_MS` or self-host. |
| `ECONNREFUSED 127.0.0.1:8545` at startup | The L1 RPC env var points at the container's own loopback, not your L1 node. See [Sequencer troubleshooting](./sequencer-troubleshooting). |

## See also

- [Hardware](./hardware): the consensus-client disk-growth caveat
- [Blob retrieval](/operate/operators/setup/blob_storage): S3, GCS, and R2 blob-store backends and archive fallbacks
- [Ethereum RPC call reference](/operate/operators/reference/ethereum_rpc_reference): per-component RPC method breakdown
- [Operator tooling](/operate/operators/tooling): L1-RPC setup scripts and installers
