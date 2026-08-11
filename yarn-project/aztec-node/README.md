# Aztec Node

The Aztec Node integrates the components that make up a node on the network — archiver, world state, p2p, sequencer, validator, prover — and exposes them over the `aztec_*`, `aztecAdmin_*`, `aztecDebug_*`, `p2p_*` and `archiver_*` JSON-RPC namespaces. `createAztecNodeService` (`src/factory.ts`) is the single entrypoint; which subsystems it assembles depends on the configuration.

## Node modes

| Mode | Enabled by | What it runs |
|---|---|---|
| Full node | the default | Archiver syncing from L1, world state, p2p, tx pool. Serves RPC. |
| Validator / sequencer | validator keys configured and `VALIDATOR_DISABLED=false` | The above plus the sequencer and validator clients, an L1 publisher, the slasher and the sentinel. |
| Prover node | `ENABLE_PROVER_NODE=true` | The above plus the prover-node subsystem (proving orchestration and epoch-proof submission). |
| **Follower** | `FOLLOWER_UPSTREAM_URL` set | Archiver replicating from a trusted upstream node over RPC, world state, and a tx gateway that forwards transactions to that upstream. No L1 connection, no p2p, no keys. |

## Follower mode

A follower node is a read-only replica of a single **trusted upstream node**. It exists to scale out RPC serving: one full node (L1 + p2p) can back a fleet of followers, none of which needs a public IP, an L1 RPC endpoint, or a signing key.

It replicates every block, checkpoint and L1-to-L2 message from the upstream through an [`RpcSyncArchiver`](../archiver/README.md#rpcsyncarchiver), which the world-state synchronizer then follows exactly as it follows an L1-syncing archiver. Every read the node serves — blocks, logs, contracts, storage, witnesses, tx effects — is answered from those local stores.

**Trust model.** A follower does not re-validate or re-execute its upstream's data: no attestation checks, no proof verification, no tx validation. It only gets the cheap consistency checks that come for free — the block stream reconciles block hashes and world state verifies archive roots per block — so a divergent upstream surfaces as a loud sync failure rather than as silently wrong data. Run a follower only against an upstream you operate or otherwise trust, over a link you control. Authentication, mTLS and rate limiting between follower and upstream are the operator's responsibility; the node does not provide them.

**Transactions.** `sendTx` is forwarded to the upstream verbatim and validated there; the follower keeps no mempool and runs no proof verifier. Pending-tx queries and tx lookups proxy the upstream. A receipt is only ever reported as mined once the follower has replicated the block that mined it — until then the tx reads as pending — so a caller that follows a receipt with a query at its block number never asks for a block this node cannot serve.

**No L1.** Contract addresses, rollup version and rollup constants come from the upstream's `getNodeInfo`/`getL1Constants`; the slot and epoch clock is arithmetic over those constants; min fees come from the upstream's fee RPCs. `ETHEREUM_HOSTS` is ignored in follower mode (and required in every other mode). The one approximation this buys: `simulatePublicCalls` picks its gas fees from the upstream's predicted-min-fee window rather than from an L1 `eth_call`, and cannot apply the simulator's chain-state overrides. Simulation is advisory, and it tracks the node that will receive the forwarded transaction.

**Startup checks.** The node fails fast when the upstream is unreachable, when its L1 chain id or rollup version disagrees with the local configuration, when the rollup constants disagree with the configured slot/epoch durations, or when the local genesis state hashes differently from the upstream's.

**Not supported.** The validator, sequencer, prover-node, offense-collection, fisherman and automine-sequencer subsystems must all be off — `assertValidFollowerConfig` refuses to start otherwise. There is no p2p stack, so the `p2p_*` namespace is not registered and peer/ENR/attestation queries answer with this node's own (empty) view. The admin `pauseSync` and `rollbackTo` APIs are rejected: the replicating archiver cannot be resumed once stopped, and its chain is whatever the upstream's is.

**Being an upstream.** Any node that owns an archiver serves the read-only `archiver_*` namespace, so no extra configuration is needed to point a follower at an existing node.

### Configuration

| Flag | Env var | Meaning |
|---|---|---|
| `--follower-upstream-url` | `FOLLOWER_UPSTREAM_URL` | URL of the upstream node. Setting it selects follower mode. |
| `--followerSyncPollingIntervalMS` | `FOLLOWER_SYNC_POLLING_INTERVAL_MS` | How often to poll the upstream for new chain state (default 1000). |
| `--followerSyncBatchSize` | `FOLLOWER_SYNC_BATCH_SIZE` | Blocks requested per upstream call, capped at the RPC ceiling of 50. |

Snapshot sync (`SYNC_MODE` / `SYNC_SNAPSHOTS_URLS`) works in follower mode: the follower reconciles whatever tip the snapshot leaves it at against its upstream on the first replication pass.

## Development

Start by running `bootstrap.sh` in the project root.

To build the package, run `yarn build` in the root.

To watch for changes, `yarn build:dev`.

To run the tests, execute `yarn test`.
