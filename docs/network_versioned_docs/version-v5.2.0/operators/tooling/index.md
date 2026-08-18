---
id: index
slug: /operators/tooling
title: Operator tooling
description: A curated index of Foundation and community-built tools that operators rely on for monitoring, key management, slashing protection, and reward tracking.
displayed_sidebar: operatorsSidebar
---

Operating an Aztec node usually involves more than the node software itself. Most operators rely on a combination of Foundation-built tools (staking dashboard, fee model) and community-built tools (dashboards, scripts, indexers) that fill specific gaps. This page is a curated index.

:::info Community tools are third-party
Foundation tools are built and maintained by the Aztec Foundation. Community tools are independent projects by individual operators or teams. Use them at your own discretion: read the source where it's available, and don't assume Foundation endorsement of operational correctness. The list below reflects what operators in the network's community actively use today.
:::

## Foundation tools

### Staking dashboard

[stake.aztec.network](https://stake.aztec.network)

The canonical interface for staking, delegation, registering sequencers, claiming rewards, and signaling governance. Supports both delegator and provider flows, including multi-rollup reward claiming and a provider commission-claim tab.

The backend API that serves this dashboard is not a supported public surface: its endpoints, response shapes, and rate limits can change without notice. If you need stable programmatic access to staking data, run your own indexer instead of calling the dashboard backend. The dashboard's indexer, [`atp-indexer`](https://github.com/AztecProtocol/staking-dashboard/tree/main/atp-indexer), is open source (a Ponder indexer in the staking-dashboard repository) and serves as the reference implementation you can self-host.

### Monitoring installer

[aztec-monitoring.sh](/scripts/aztec-monitoring.sh)

A single self-contained script that sets up a full self-hosted monitoring stack for your sequencers: an OpenTelemetry collector next to each node, plus Grafana, Prometheus, and Alertmanager with Telegram alerts on a monitoring machine. The Grafana dashboard, alert rules, and Alertmanager template are embedded in the script. Targets `v5.0.0` and works with nodes run via Docker Compose. This is the recommended starting point for node monitoring; see [Monitoring and metrics](/operate/operators/concepts/monitoring#set-up-monitoring-with-the-installer) for the walkthrough. It is optional and replaceable with your own monitoring.

### Fee model

[github.com/AztecProtocol/aztec-fee-model](https://github.com/AztecProtocol/aztec-fee-model)

A self-hostable spreadsheet model for sequencer profitability under different gas, AZTEC price, and commission inputs. Useful for providers calibrating their commission rate.

### Staking payout script

[github.com/AztecProtocol/aztec-staking-payout](https://github.com/AztecProtocol/aztec-staking-payout)

Opt-in payout script for providers who set their coinbase to an address they control instead of the per-delegation Split contracts. Calculates each delegator's rewards at the provider's published commission and produces a Multicall3 transfer batch plus auditable JSON artifacts. See the [forum announcement](https://forum.aztec.network/t/operator-commission-adjustments/8588).

## Community tools

### Monitoring and dashboards

**[dashtec.xyz](https://dashtec.xyz)**
The de-facto operator dashboard for the network. Per-epoch performance, provider pages, the activation queue, watchlists.

**[aztec.vision](https://aztec.vision)**
Indexer-style provider information. Surfaces misconfigured coinbase addresses (a frequent operator footgun), per-provider stats, and history.

**[haveibeenslashed.xyz](https://haveibeenslashed.xyz)**
A focused single-purpose tool for checking whether a given attester address has been hit by slashing or jailing events.

**[aztec-providers.01.ro](https://aztec-providers.01.ro)**
A provider-side indexer, useful as a cross-check for provider-side reward routing.

**[citizenweb3/chain-data-indexer (aztec branch)](https://github.com/citizenweb3/chain-data-indexer/tree/aztec)**
A self-hostable Aztec L2 indexer (Chicmoz-based, MIT): a listener that ingests proposed and proven blocks, transactions, and chain info, plus an explorer REST API. Useful if you want your own chain/explorer data feed rather than relying on a hosted explorer. For staking-specific data, the dashboard's [`atp-indexer`](https://github.com/AztecProtocol/staking-dashboard/tree/main/atp-indexer) (above) is the closer fit.

### Scripts and installers

**[pittpv/aztec-monitoring-script](https://github.com/pittpv/aztec-monitoring-script)**
A community bash-menu installer and monitoring script. One-stop install, upgrade, downgrade, status check, and Telegram alerting. An alternative to the Foundation [monitoring installer](#monitoring-installer) above.

**[pittpv/aztec-rpc-script](https://github.com/pittpv/aztec-rpc-script)**
Companion script for setting up your own Ethereum execution + consensus client (with the supernode flags Aztec requires). Avoids depending on a hosted RPC provider.

### Provider and key management

**[aztec-scan/aztec-butler](https://github.com/aztec-scan/aztec-butler)**
A CLI for operators running multiple nodes, from the team behind the AztecScan explorer. Generates and deploys validator keys, registers them, tracks each attester through its lifecycle states, sets coinbase addresses, and exports telemetry. Runs on Node.js as a systemd daemon; supports native and Olla registries. A newer, more advanced tool aimed at provider-scale operations rather than single-node setups.

### Coordination

**[aztecgov.nethermind.io](https://aztecgov.nethermind.io)**
Nethermind's governance signaling dashboard. Shows the current AZIP payload, who has signaled, and what's pending. Operators use this to confirm a vote made it onchain.

**[slashveto.me](https://slashveto.me)**
The community veto council's coordination surface. Monitors slashing payloads and signals which ones the council intends to veto. Operators consult this during incidents where their setup might trip a slashing condition.

## Suggest a tool

If you maintain or use an operator tool that should be listed here, open an issue or PR on the docs repo.

Foundation does not formally endorse community tools; this page reflects what's in active use.
