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

## Set up monitoring with the installer

The fastest way to a complete stack is the maintained installer script. It sets up an OpenTelemetry collector next to your node and, on a monitoring machine, a Grafana dashboard, Prometheus, and Alertmanager with Telegram alerts. Everything runs on infrastructure you control. It is optional, and adaptable or replaceable with your own monitoring; nothing here is required to operate a node.

The script is one self-contained file: the dashboard, alert rules, and Alertmanager template are embedded in it. It targets Aztec `v5.0.0` and works with sequencer nodes run via Docker Compose.

**Prerequisites:** Docker Engine with the Docker Compose plugin on every machine. Verify with `docker compose version`. The monitoring machine must be able to reach each node on port `8889`; it can be one of the node servers, but a separate machine keeps alerting alive even if a node host goes down.

**Step 1: on the sequencer node.** Download and run the script, then choose **option 1** (set up node metrics):

```bash
curl -fsSLO https://docs.aztec.network/scripts/aztec-monitoring.sh
bash aztec-monitoring.sh
```

The script finds your node's `docker-compose.yml`, writes a `docker-compose.override.yml` that enables metrics export (your base compose file is never modified), shows it to you for confirmation, and restarts the node. Afterward a collector serves Prometheus-format metrics on port `8889`. Open port `8889` only to the monitoring machine's IP, not the public internet:

```bash
sudo ufw allow from <monitoring-machine-ip> to any port 8889 proto tcp
```

**Step 2: repeat on every additional node** (for high availability or a larger fleet). Each node gets its own collector on its own port `8889`.

**Step 3: on the monitoring machine.** Download and run the script, then choose **option 2** (set up the monitoring stack):

```bash
curl -fsSLO https://docs.aztec.network/scripts/aztec-monitoring.sh
bash aztec-monitoring.sh
```

The script asks for each node as `<node-ip>:8889` with a label you choose (for example `sequencer-1`), offers Telegram setup (it walks you through creating a bot with `@BotFather` and detects your chat id), then starts Grafana, Prometheus, and Alertmanager and confirms every node target is up. If a target is down, the usual cause is the port `8889` firewall rule from Step 1.

**Step 4: open the dashboard** at `http://localhost:3000` on the monitoring machine (or tunnel with `ssh -L 3000:localhost:3000 <user>@<monitoring-machine>`). Log in with `admin` / `admin` and change the password. Pick your node in the **instance** dropdown at the top.

**Day-2:** re-run `bash aztec-monitoring.sh` on the relevant machine at any time; settings are kept between runs. Option 2 adds or removes nodes, option 3 manages Telegram, option 4 shows what is installed, option 5 uninstalls (node and monitoring sides independently). To update, re-download the script and re-run the option you use on that machine.

Keep ports `3000` (Grafana), `9090` (Prometheus), and `9093` (Alertmanager) closed to the public internet. The stack is read-only toward your node: it scrapes metrics and never touches keys, the database, or node configuration beyond the metrics override.

## Set up monitoring manually

If you prefer to run your own stack instead of the installer:

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

## What about alerting on slashing risk

Since v5.2.0 the node warns you directly when the network votes to slash one of your own validators. It watches slashing votes that name your attesters, logs `Own validator 0x... targeted by slashing vote (N of Q votes needed to slash)` on every such vote, and logs `Own validator 0x... was slashed for ...` once a round executes. The same signal is exported as metrics: alert on `aztec_slasher_own_validator_current_round_votes_max` approaching `aztec_slasher_quorum_size`. Votes cast while your node is offline are not counted, so treat the metric as a floor.

The slashing vote itself still happens on L1 through the TallySlashingProposer contract, so once a slash payload is queued it is too late to fix the underlying behavior. Use these additional proxies as early warning:

- Alert on **missed attestations and missed proposals**. Inactivity slashing is the accumulation of missed duties, so sustained failures are the direct early warning: they precede an inactivity penalty. The [installer](#set-up-monitoring-with-the-installer) ships alert rules for both (failed attestations and failed proposals in the last hour), so a stack set up that way warns you before the pattern becomes slashable.
- Watch `aztec_l1_publisher_balance_eth` (above). A dry publisher is a common upstream cause of missed proposals; the installer alerts on it too.
- Check **slashveto.me**, where the community veto council surfaces pending slash payloads before they execute.
- Watch your performance on **dashtec.xyz**. A drop in your attestation rate is the same signal, visible without your own monitoring.

See [Slashing](./slashing) for the full slashing context.

## See also

- [Monitoring](/operate/operators/monitoring): full Prometheus, Grafana, and OTel setup guides
- [Metrics reference](/operate/operators/monitoring/metrics-reference): the full metric list and their meanings
- [Monitoring troubleshooting](/operate/operators/monitoring/troubleshooting): fixing common scraping problems
- [Operator tooling](/operate/operators/tooling): community monitoring scripts and dashboards
