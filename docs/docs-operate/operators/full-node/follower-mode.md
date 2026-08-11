---
id: follower-mode
title: Follower mode
description: Run a read-only node that replicates all chain state from a trusted upstream node instead of from L1 and the p2p network.
displayed_sidebar: operatorsSidebar
references:
  ["yarn-project/aztec-node/src/follower/config.ts", "yarn-project/aztec-node/src/follower/factory.ts"]
---

## Overview

A **follower node** is a read-only Aztec node that replicates every block, checkpoint and L1-to-L2 message from a single **upstream node** over RPC, instead of syncing from L1 and gossiping over the p2p network. It exists so that one full node can back a horizontally scaled fleet of RPC-serving nodes.

Compared to a [full node](./overview.md), a follower needs:

- no Ethereum RPC endpoint,
- no public IP address or open p2p ports,
- no keys of any kind.

It answers almost every read — blocks, logs, contracts, public storage, note-hash and nullifier membership witnesses, transaction effects — from its own local database, and forwards the transactions it receives to its upstream. The one exception is the L2-to-L1 message membership witness (`getL2ToL1MembershipWitness`), which is built from Outbox roots that only an L1-connected node can read: a follower forwards that call to its upstream, so it is the one read that fails while the upstream is unreachable.

## Trust model

A follower does **not** re-validate or re-execute the chain data its upstream sends it. It checks no committee attestations and verifies no rollup proofs. It gets only the consistency checks that come for free: block-hash continuity as it replicates, and archive-root verification as world state applies each block. A divergent upstream therefore shows up as a loud, persistent sync failure rather than as silently wrong data — but a malicious upstream that serves a self-consistent fake chain will be believed.

Validation runs in the other direction: a follower does validate the transactions its own clients submit, before forwarding them (see [Transaction validation](#transaction-validation)).

Run a follower only against an upstream you operate, or one you trust as much as you trust your own node, over a link you control. Authentication, TLS and rate limiting between a follower and its upstream are your responsibility; the node itself provides none.

## Configuration

Setting `FOLLOWER_UPSTREAM_URL` puts the node in follower mode.

```bash
--follower-upstream-url <url>                ($FOLLOWER_UPSTREAM_URL)
--follower-sync-polling-interval-ms <ms>     ($FOLLOWER_SYNC_POLLING_INTERVAL_MS)
--follower-sync-batch-size <n>               ($FOLLOWER_SYNC_BATCH_SIZE)
--follower-skip-tx-validation                ($FOLLOWER_SKIP_TX_VALIDATION)
```

- `FOLLOWER_UPSTREAM_URL` — the upstream node's RPC URL. Any Aztec node can act as an upstream with no extra configuration.
- `FOLLOWER_SYNC_POLLING_INTERVAL_MS` — how often to poll the upstream for new chain state. Defaults to `1000`.
- `FOLLOWER_SYNC_BATCH_SIZE` — how many L2 blocks to request per upstream call. Capped at the RPC limit of `50`.
- `FOLLOWER_SKIP_TX_VALIDATION` — forward transactions without validating them locally first. Defaults to `false`; see [Transaction validation](#transaction-validation).

A minimal follower `.env`:

```bash
FOLLOWER_UPSTREAM_URL=http://upstream-node.internal:8080
P2P_ENABLED=false
VALIDATOR_DISABLED=true
DATA_DIRECTORY=/var/lib/aztec
LOG_LEVEL=info
```

`ETHEREUM_HOSTS` is **not** required, and is ignored if set: contract addresses, the rollup version and the rollup constants all come from the upstream. Snapshot sync (`SYNC_MODE`, `SYNC_SNAPSHOTS_URLS`) works as usual and is the fastest way to bootstrap a new follower; it reconciles against the upstream on the first replication pass.

## What a follower cannot do

The node refuses to start if any of these subsystems is enabled alongside `FOLLOWER_UPSTREAM_URL`:

| Setting | Required value |
|---|---|
| `VALIDATOR_DISABLED` | `true` |
| `P2P_ENABLED` | `false` |
| `ENABLE_PROVER_NODE` | `false` |
| `OFFENSE_COLLECTION_ENABLED` | `false` |
| `FISHERMAN_MODE` | `false` |
| `USE_AUTOMINE_SEQUENCER` | `false` |

A follower also has no p2p stack, so the `p2p_*` RPC namespace is not served and peer, ENR and attestation queries return this node's own — empty — view. The admin `pauseSync`, `rollbackTo` and `startSnapshotUpload` endpoints are rejected: a follower's chain is whatever its upstream's chain is, and it has no L1 block number to stamp a snapshot with.

Two behaviors differ subtly from a full node and are worth knowing about:

- **Transaction receipts.** A transaction the upstream has already mined is reported as `pending` until the follower has replicated the block that mined it. This keeps a receipt from ever pointing at a block this node cannot serve.
- **Public simulation.** `simulatePublicCalls` derives its gas fees from the upstream's predicted-minimum-fee window rather than from an Ethereum `eth_call`, and cannot apply chain-state overrides. Simulation is advisory, and it tracks the node that will actually receive the forwarded transaction.

## Transaction validation

A follower runs the same validation pipeline a full node runs on transactions received over RPC, before forwarding anything to its upstream. Both `sendTx` and `aztec_isValidTx` check:

- transaction structure, size and calldata counts;
- chain metadata: L1 chain id, rollup version, verification-key tree root, protocol contracts hash;
- the expiration timestamp against the next slot;
- double spends, against both the transaction itself and this node's nullifier tree;
- gas limits, the maximum fees per gas, and the fee payer's fee-juice balance;
- the public-setup allow list;
- the anchor block the transaction was built against;
- the client proof.

This is a resource shield and a faster failure for the client, **not** a security boundary: the upstream re-validates everything forwarded to it regardless, so a follower cannot admit a transaction its upstream would reject.

Two things a follower cannot check are the state of the upstream's mempool: whether the transaction is already in the pool, and whether the pool has room for it. Those rejections still come back from the upstream.

The anchor-block check runs against the follower's own archive tree, which assumes a client builds transactions against the same node it submits them to (or one that is equally or less synced). A transaction anchored on a block the follower has not replicated yet is rejected rather than forwarded.

Set `FOLLOWER_SKIP_TX_VALIDATION=true` (or pass `--follower-skip-tx-validation`) to turn all of this off and run the follower as a pure relay. It then builds no proof verifier and forwards every transaction untouched, leaving the upstream as the only filter. This suits a resource-constrained follower that would rather not spend CPU verifying client proofs.

## Startup checks

A follower fails fast, with an explicit error, when:

- the upstream node is unreachable;
- the upstream's L1 chain id or rollup version disagrees with this node's configuration;
- the upstream's rollup constants disagree with the configured slot or epoch duration;
- the local genesis state hashes differently from the upstream's.

## Monitoring

Use the node's `aztec_isReady` RPC method as the readiness signal for a load balancer. On a follower it reports ready once the node has replicated the whole chain at least once and its world state is running. It deliberately stays ready while the follower is a block or two behind, so a busy chain does not flap the check; use the usual block-number and sync metrics to alert on a follower that has fallen behind or lost contact with its upstream.
