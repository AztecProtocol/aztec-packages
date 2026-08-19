---
id: sequencer-troubleshooting
title: Sequencer troubleshooting
description: A symptom-first guide to diagnosing a sequencer that is running but not proposing or attesting, covering publisher balance, L1 RPC, peer count, and coinbase configuration.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/sequencer-client/src/publisher/*", "yarn-project/p2p/src/config.ts", "yarn-project/ethereum/src/l1_reader.ts", "yarn-project/node-keystore/src/*"]
---

Your node is running but proposals or attestations are not landing. This page is a decision tree for the most common causes, in the order worth checking them. Each branch points to the page with the full fix.

## Start here

Confirm the symptom first. A sequencer only proposes during slots it is assigned, so a quiet period is normal. Before troubleshooting, check that the node is actually missing assigned duties rather than simply waiting for a slot:

- **`docker compose ps`** should show the sequencer as `(healthy)`. The health check in the reference compose file requires the node to be answering its API with a proven L2 tip and a synced chain time within the last five minutes, so this one line covers API readiness, container stability, and whether the node is keeping up. If it shows `(unhealthy)` or `starting` long after startup, the node is not keeping up. See [Verify everything works](../solo-sequencer/verify) for what each status means.
- **Look up your attester on an explorer** (Dashtec or Aztec Vision) and check its recent attestation and proposal record. A drop in your attestation rate is the signal that something is wrong.

You do not need a monitoring stack for these. Where a section below names a Prometheus metric, that is the equivalent check if you run Prometheus and Grafana; the `docker compose ps`, log, and explorer checks work without one.

If duties are genuinely being missed, work through the checks below in order.

## 1. Is the node synced and seeing new blocks?

A node that has fallen behind the chain tip cannot propose.

- **Check (no monitoring stack):** run `docker compose logs -f aztec-sequencer` and watch for the block number to keep climbing. A node that is following the chain logs steady progress; one that is stuck stops advancing or repeats the same errors. `docker compose ps` showing `(healthy)` (above) also confirms the node has a recent proven tip.
- **Check (with monitoring):** `aztec_archiver_block_height` (your L2 view) and `aztec_archiver_l1_block_height` (your L1 view) are both advancing.
- **If the L2 view is stuck:** the node is not following the chain. Check the L1 RPC (next section) first, since most sync stalls trace back to it.
- **If the L1 view is stuck:** your L1 RPC is degraded or unreachable. See [L1 RPC requirements](./l1-rpc).

## 2. Is the publisher funded?

The publisher account pays L1 gas to submit proposals. When it runs dry, the node stops being able to propose. A single missed proposal is not slashable, but if the node misses almost all its duties over a full epoch (about 38 minutes on mainnet) it hits the inactivity threshold, which is slashable. See [Slashing](./slashing#the-inactivity-threshold).

- **Check (no monitoring stack):** query the publisher's L1 balance directly with `cast balance <your-publisher-address> --rpc-url <your-L1-RPC> --ether`. You can also paste the publisher address into a block explorer ([Etherscan](https://etherscan.io) for mainnet, [Sepolia Etherscan](https://sepolia.etherscan.io) for testnet) and read its balance there. If it is near zero, this is your cause.
- **Check (with monitoring):** `aztec_l1_publisher_balance_eth`.
- **Fix:** top up the publisher account. Keep enough headroom that a single proposal during an L1 gas spike cannot drain the balance. See [Fund accounts](../solo-sequencer/fund-accounts) and the publisher-funding calculator there.

## 3. Is the L1 RPC serving everything the node needs?

A node needs an execution RPC, a blob-serving consensus client, and trace methods. A gap in any one stops the node from following or publishing.

- **`ECONNREFUSED 127.0.0.1:8545` (or your L1 port) at startup:** nothing is listening at the address the node is dialing. From inside a container, `127.0.0.1` is the container's own loopback, not the host, so an L1 RPC reachable on the host is unreachable under this setting. Point the L1 RPC environment variable at an address the container can reach.
- **`429 Too Many Requests`:** the RPC is rate-limiting the node off the chain. Raise the archiver polling intervals or self-host.
- **Startup blob-source summary shows `consensusSuperNodes=0`:** the consensus client is not serving blob sidecars. Restart it with a supernode or semi-supernode flag.
- **Startup logs warn that `debug_traceTransaction` failed:** the execution RPC does not expose trace methods, or does not retain enough recent history for them. The node validates trace availability at startup and warns when it is missing.

Full causes and fixes for all of these are in [L1 RPC requirements](./l1-rpc#the-most-common-l1-side-errors).

## 4. Is the node connected to enough peers?

A node isolated from the network cannot receive the transactions and attestations it needs, or broadcast its own.

Since v5.2.0 a node with **zero** connected peers stops acting rather than acting blindly, and says so in its logs:

- It logs `Node has no connected peers; gossip and tx propagation are unavailable` at warn, repeated roughly once a minute, and one info line when connectivity returns.
- It skips building and proposing checkpoints while below `SEQ_MIN_PEERS_TO_PROPOSE` (default 1), logging `Skipping checkpoint proposal for slot N since we have too few connected peers`. L1-only duties (governance and slashing votes, prune, invalidation) still run.
- It does not file data-withholding slashing offenses for slots probed while peerless, since an empty local mempool is not evidence without gossip.
- It rejects incoming `sendTx` calls instead of silently dropping them.

Setups that disable p2p entirely (local network, single node) are unaffected by all four gates.

- **Check (no monitoring stack):** confirm your P2P port is reachable from outside your network with `nc -zv <your-external-IP> 40400`. A closed port is the usual reason a node cannot find peers. The node logs also report peer activity as it connects.
- **Check (with monitoring):** `aztec_peer_manager_peer_count_peers`. Below 5 indicates a reachability problem.
- **Check (health endpoint):** `curl http://localhost:8080/status` reports p2p connectivity per component. Set `P2P_HEALTH_MIN_PEERS` (default 0, report-only) to make a low peer count fail the health check.
- **Fix:** confirm your external IP is correct and that the P2P port is forwarded and open in your firewall (TCP and UDP). See [Monitoring and metrics](./monitoring#what-every-operator-should-alert-on).

## 5. Is the coinbase set correctly?

A misconfigured coinbase does not stop a node from proposing, but it routes rewards to the wrong place, which often surfaces as an "I am proposing but not getting rewards" report. Check this if duties are landing but rewards are not.

- **Solo sequencer:** the coinbase is set in your keystore. If you never set `--coinbase` at setup, rewards accrue against the attester address. See [Identity model](./identity-model).
- **Staking provider:** in the default flow, each delegated attester's coinbase must point at that delegation's Split contract; a coinbase pointing elsewhere routes the delegation's rewards around the Split. If instead you use the [Aztec staking payout tool](https://github.com/AztecProtocol/aztec-staking-payout), every coinbase points at a single address you control and the tool distributes each delegator's share offchain, so the per-delegation Split check does not apply. See [Provider operations](../provider/provider-operations) for the per-delegation update procedure.

## Still stuck?

If none of the above explains the missed duties, gather your node logs and the metric values above and ask in [Discord](https://discord.com/invite/aztec). See also the [operator FAQ](../operator-faq) for error-specific entries.
