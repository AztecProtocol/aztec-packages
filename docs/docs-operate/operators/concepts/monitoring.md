---
id: monitoring
title: Monitoring and metrics
description: The handful of metrics that actually matter for keeping your sequencer alive, plus what to alert on and where the dashboards live.
displayed_sidebar: operatorsSidebar
---

The Aztec node exposes over 250 Prometheus metrics. Most operators only need to watch a small handful to keep their sequencer healthy.

## TL;DR

- Alert on **L2 block height not advancing** for 15 minutes.
- Alert on **publisher ETH running low** (for example below 0.1 ETH). A dry publisher misses proposals. A single miss is not slashable, but missing almost all duties over a full epoch (about 38 minutes on mainnet) hits the inactivity threshold, which is slashable. Leave headroom: a single proposal during an L1 gas spike can burn through a thin balance before you can act.
- Alert on **peer count below 5**. Network reachability problem.
- For everything else, the community dashboards (dashtec.xyz, aztec.vision, slashveto.me) cover you.

## The metrics that matter

Aztec emits OpenTelemetry metrics, which Prometheus scrapes as snake-cased names (`aztec.archiver.block_height` becomes `aztec_archiver_block_height` on the wire).

| Prometheus metric | What it tells you | Alert if |
|---|---|---|
| `aztec_archiver_block_height` | Your local view of the L2 chain tip | No advance for 15 minutes |
| `aztec_archiver_l1_block_height` | Your local view of L1 progression | No advance for 5 minutes (likely your L1 RPC is down) |
| `aztec_peer_manager_peer_count_peers` | P2P connectivity to other nodes | Drops below 5 |
| `aztec_l1_publisher_balance_eth` | ETH in your publisher account for paying L1 gas | Drops below 0.1 ETH |
| `aztec_mempool_tx_count` | Transactions waiting to be included | Sustained growth or sudden spike |

Plus standard system metrics (`process_cpu_utilization`, `process_memory_usage`) for the underlying host.

To confirm the sequencer is producing, watch `aztec_sequencer_block_count` (see [Metrics reference](/operate/operators/monitoring/metrics-reference) for the full list and the alert rules).

## What every operator should alert on

In priority order:

1. **No L2 blocks processed in the last 15 minutes** (critical). Your node is stuck or the network has stalled. Either way, you need to know immediately.
2. **Publisher balance below 0.1 ETH** (critical). When the publisher runs dry, you stop being able to publish proposals. Stay dry for a full epoch and the missed duties hit the inactivity threshold, which is slashable. Keep enough headroom that an L1 gas spike cannot drain the balance in a single proposal.
3. **Peer count below 5** (warning). Network reachability problem. Check port forwarding and firewall.
4. **L1 block height stalled for 5+ minutes** (warning). Your L1 RPC is degraded. See [L1 RPC](./l1-rpc) for common causes.
5. **CPU sustained above 70% of cores** (warning). May indicate the node is struggling to keep up; check disk IOPS and RAM headroom.

## How to wire this up

The shortest path from zero to a working monitoring stack:

1. **Enable metrics on your node** by setting the OpenTelemetry environment variables. Point the exporter at your OTLP collector and give the node a service name:

   ```bash
   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
   OTEL_SERVICE_NAME=aztec-sequencer
   ```

   `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` is the OTLP HTTP endpoint of your collector (port `4318` is the OTLP/HTTP default). The node also emits a `service.instance.id` that changes on every restart; pin a stable `instance` label in Prometheus so your series survive restarts, see [Keep your time series stable across restarts](#keep-your-time-series-stable-across-restarts).
2. **Run Prometheus** to scrape `http://your-node:metrics-port/metrics` at 15-second intervals.
3. **Run Grafana** pointed at Prometheus.
4. **Import a dashboard.** A community-maintained Grafana dashboard for Aztec validators is available at [grafana.com/grafana/dashboards/23054](https://grafana.com/grafana/dashboards/23054-aztec-validator/).

For step-by-step instructions on each, see [Monitoring setup guides](/operate/operators/monitoring) in Advanced operations. Both Prometheus and Grafana configurations are covered in detail there.

## Keep your time series stable across restarts

Prometheus identifies a time series by its full label set. Aztec generates a fresh `service.instance.id` each time the node process starts, so the `instance` label changes on every restart. Each restart then looks like a brand-new series to Prometheus, and dashboards and alert rules built on the old label go blank.

Pin the `instance` label in your Prometheus scrape config with a relabel rule. This is independent of what the node reports, so it survives restarts:

```yaml
scrape_configs:
  - job_name: "aztec-node"
    static_configs:
      - targets: ["your-node:metrics-port"]
    relabel_configs:
      - target_label: instance
        replacement: my-sequencer-01
```

Use a distinct, durable value for each node (for example `my-sequencer-01`, `my-sequencer-02`), and keep it the same across restarts and upgrades of that node. The node's own generated id is preserved as `exported_instance` (Prometheus keeps the original under an `exported_` prefix when a scrape label collides, unless you set `honor_labels: true`).

## Community monitoring options

If you do not want to maintain your own Prometheus + Grafana stack:

- **pittpv's monitoring script** runs a bundled installer with Telegram alerts. See [Operator tooling](/operate/operators/tooling).
- **dashtec.xyz** shows per-epoch performance for any registered attester. No install required; sign in and add your attester to your watchlist.
- **aztec.vision** surfaces misconfigured coinbase addresses and provider-level stats. Useful even if you only check it manually a few times a week.

## What about alerting on slashing risk

The Aztec node does not natively emit a "you are about to be slashed" metric. The slashing voting process happens on L1 through the TallySlashingProposer contract; by the time a slash payload is queued, it is too late to fix the underlying behavior.

The actionable proxies:

- Watch `aztec_l1_publisher_balance_eth` (above). Most slashing incidents trace back to a failed publish, which traces back to an L1 issue.
- Check **slashveto.me**, where the community veto council surfaces pending slash payloads before they execute.
- Watch your performance on **dashtec.xyz**. A drop in your attestation rate is the early signal that an inactivity payload is coming.

See [Slashing](./slashing) for the full slashing context.

## See also

- [Monitoring](/operate/operators/monitoring): full Prometheus, Grafana, and OTel setup guides
- [Metrics reference](/operate/operators/monitoring/metrics-reference): the full metric list and their meanings
- [Monitoring troubleshooting](/operate/operators/monitoring/troubleshooting): fixing common scraping problems
- [Operator tooling](/operate/operators/tooling): community monitoring scripts and dashboards
