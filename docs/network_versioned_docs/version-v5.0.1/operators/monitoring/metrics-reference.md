---
title: Key Metrics Reference
description: Comprehensive guide to understanding and using the metrics exposed by your Aztec node for monitoring and observability.
displayed_sidebar: operatorsSidebar
---

## Overview

Your Aztec node exposes metrics through OpenTelemetry to help you monitor performance, health, and operational status. This guide covers key metrics across node types and how to use them effectively.

:::tip Discovering Metrics
Once your monitoring stack is running, you can discover available metrics in the Prometheus UI at `http://localhost:9090/graph`. Start typing in the query box to see autocomplete suggestions for metrics exposed by your node.
:::

## Prerequisites

- Complete monitoring stack setup following the [Monitoring Overview](./)
- Ensure Prometheus is running and scraping metrics from your OTEL collector
- Verify access to Prometheus UI at `http://localhost:9090`

:::warning Metric Names May Vary
The exact metric names and labels in this guide depend on your node type, version, and configuration. Always verify the actual metrics exposed by your node using the Prometheus UI metrics explorer at `http://localhost:9090/graph`. Common prefixes: `aztec_archiver_*`, `aztec_sequencer_*`, `aztec_prover_*`, `process_*`.
:::

:::info How metric names are formed
The node defines metrics in OpenTelemetry style with dotted names like `aztec.archiver.block_height`. When Prometheus scrapes them, two transformations apply, so the name you query is not the name in the source:

1. Dots become underscores: `aztec.archiver.block_height` becomes `aztec_archiver_block_height`.
2. The unit is appended as a suffix. A metric with unit `eth` gains `_eth` (`aztec.l1_publisher.balance` becomes `aztec_l1_publisher_balance_eth`); unit `peers` gains `_peers` (`aztec.peer_manager.peer_count` becomes `aztec_peer_manager_peer_count_peers`).

If a metric name in this guide returns nothing, type its prefix into the Prometheus explorer and read the exact exported name, including any unit suffix.
:::

## Querying with PromQL

Use Prometheus Query Language (PromQL) to query and analyze your metrics. Understanding these basics will help you read the alert rules throughout this guide.

### Basic Queries

```promql
# Instant vector - current value
aztec_archiver_block_height

# Range vector - values over time
aztec_archiver_block_height[5m]
```

### Rate and Increase

```promql
# Rate of change per second (for counters)
rate(aztec_sequencer_block_proposal_failed_count[5m])

# Blocks synced over time window (for gauges)
increase(aztec_archiver_block_height[1h])

# Derivative - per-second change rate of gauges
deriv(process_memory_usage[30m])
```

### Arithmetic Operations

Calculate derived metrics using basic math operators:

```promql
# Calculate percentage (block proposal failure rate)
(increase(aztec_sequencer_slot_total_count[15m]) - increase(aztec_sequencer_slot_filled_count[15m]))
/ increase(aztec_sequencer_slot_total_count[15m])

# Convert a 0..1 ratio to a percentage scale
process_cpu_utilization * 100
```

### Comparison Operators

Filter and alert based on thresholds:

```promql
# Greater than (70% of available CPU)
process_cpu_utilization > 0.7

# Less than
aztec_peer_manager_peer_count_peers < 5

# Equal to
increase(aztec_archiver_block_height[15m]) == 0

# Not equal to (no new blocks proposed in the window)
increase(aztec_sequencer_block_count[15m]) == 0
```

### Time Windows

Choose time windows based on metric behavior and alert sensitivity:

- **Short windows** (`[5m]`, `[10m]`) - Detect immediate issues, sensitive to spikes
- **Medium windows** (`[15m]`, `[30m]`) - Balance between responsiveness and stability, recommended for most alerts
- **Long windows** (`[1h]`, `[2h]`) - Trend analysis, capacity planning, smooth out temporary fluctuations

Example: `increase(aztec_archiver_block_height[15m])` checks if blocks were processed in the last 15 minutes - long enough to avoid false alarms from brief delays, short enough to catch real problems quickly.

## Core Node Metrics

Your node exposes these foundational metrics for monitoring blockchain synchronization and network health. Configure immediate alerting for these metrics in all deployments.

### L2 Block Height Progress

Track whether your node is actively processing new L2 blocks:

- **Metric**: `aztec_archiver_block_height`
- **Description**: Current L2 block number the node has synced to

**Alert rule**:
```yaml
- alert: L2BlockHeightNotIncreasing
  expr: increase(aztec_archiver_block_height{aztec_status=""}[15m]) == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Aztec node not processing L2 blocks"
    description: "No L2 blocks processed in the last 15 minutes. Node may be stuck or out of sync."
```

### Peer Connectivity

Track the number of active P2P peers connected to your node:

- **Metric**: `aztec_peer_manager_peer_count_peers`
- **Description**: Number of outbound peers currently connected to the node

**Alert rule**:
```yaml
- alert: LowPeerCount
  expr: aztec_peer_manager_peer_count_peers < 5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Low peer count detected"
    description: "Node has only {{ $value }} peers connected. Risk of network isolation."
```

### L1 Block Height Progress

Monitor whether your node is seeing new L1 blocks:

- **Metric**: `aztec_archiver_l1_block_height`
- **Description**: Latest L1 (Ethereum) block number seen by the node

**Alert rule**:
```yaml
- alert: L1BlockHeightNotIncreasing
  expr: increase(aztec_archiver_l1_block_height[15m]) == 0
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Node not seeing new L1 blocks"
    description: "No L1 block updates in 15 minutes. Check L1 RPC connection."
```

## Sequencer Metrics

If you're running a sequencer node, monitor these metrics for consensus participation, block production, and L1 publishing. Configure alerting for critical operations.

### L1 Publisher ETH Balance

Monitor the ETH balance used for publishing to L1 to prevent transaction failures:

- **Metric**: `aztec_l1_publisher_balance_eth`
- **Description**: Current ETH balance of the L1 publisher account

**Alert rule**:
```yaml
- alert: LowL1PublisherBalance
  expr: aztec_l1_publisher_balance_eth < 0.5
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "L1 publisher ETH balance critically low"
    description: "Publisher balance is {{ $value }} ETH. Refill immediately to avoid transaction failures."
```

### Sequencer Liveness

There is no single gauge that reports a sequencer "healthy/unhealthy" state. Observe liveness through the work the sequencer does: a running sequencer keeps building blocks and keeps its archiver advancing. Alert when block production stalls.

- **Metric**: `aztec_sequencer_block_count`
- **Description**: Count of blocks this sequencer has built. A flat count over a full proposal window means the sequencer is not producing.

**Alert rule**:
```yaml
- alert: SequencerNotProducing
  expr: increase(aztec_sequencer_block_count[30m]) == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Sequencer is not building blocks"
    description: "No blocks built in the last 30 minutes. Check sequencer logs and confirm the node is in the committee."
```

:::note
A sequencer only builds blocks during slots it is assigned, so size the window to span several of your expected slots before alerting. If you want a node-level liveness signal that is independent of slot assignment, alert on `aztec_archiver_block_height` not advancing instead (see [L2 Block Height Progress](#l2-block-height-progress)).
:::

### Block Proposal Failures

Track failed block proposals by comparing slots to filled slots:

- **Metrics**: `aztec_sequencer_slot_total_count` and `aztec_sequencer_slot_filled_count`
- **Description**: Tracks slots assigned to your sequencer versus slots successfully filled. Alert triggers when the failure rate exceeds 5% over 15 minutes.

**Alert rule**:
```yaml
- alert: HighBlockProposalFailureRate
  expr: |
    (increase(aztec_sequencer_slot_total_count[15m]) - increase(aztec_sequencer_slot_filled_count[15m]))
    / increase(aztec_sequencer_slot_total_count[15m]) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High block proposal failure rate"
    description: "{{ $value | humanizePercentage }} of block proposals are failing in the last 15 minutes."
```

### Blob Publishing Failures

Track failures when publishing blobs to L1:

- **Metric**: `aztec_l1_publisher_blob_tx_failure`
- **Description**: Number of failed blob transaction submissions to L1

**Alert rule**:
```yaml
- alert: BlobPublishingFailures
  expr: increase(aztec_l1_publisher_blob_tx_failure[15m]) > 0
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Blob publishing failures detected"
    description: "{{ $value }} blob transaction failures in the last 15 minutes. Check L1 gas prices and publisher balance."
```

### Attestation Activity

Track your sequencer's participation in the consensus protocol:

- **Metrics**: Attestations submitted, attestation success rate, attestation timing
- **Use cases**:
  - Verify your sequencer is actively participating
  - Monitor attestation success rate
  - Detect missed attestation opportunities

### Block Proposals

Monitor block proposal activity and success:

- **Metrics**: Blocks proposed, proposal success rate, proposal timing
- **Use cases**:
  - Track block production performance
  - Identify proposal failures and causes
  - Monitor proposal timing relative to slot schedule

### Committee Participation

Track your sequencer's involvement in consensus committees:

- **Metrics**: Committee assignments, participation rate, duty execution
- **Use cases**:
  - Verify your sequencer is assigned to committees
  - Monitor duty execution completion rate
  - Track committee participation over time

### Performance Metrics

Measure block production efficiency:

- **Metrics**: Block production time, validation latency, processing throughput
- **Use cases**:
  - Optimize block production pipeline
  - Identify performance bottlenecks
  - Compare performance against network averages

## Prover Metrics

If you're running a prover node, track these metrics for proof generation workload and resource utilization.

### Job Queue

Monitor pending proof generation work:

- **Metrics**: Queue depth, queue wait time, job age
- **Use cases**:
  - Detect proof generation backlogs
  - Capacity planning for prover resources
  - Monitor job distribution across agents

### Proof Generation

Track proof completion metrics:

- **Metrics**: Proofs completed, completion time, success rate, failure reasons
- **Use cases**:
  - Monitor proof generation throughput
  - Identify failing proof types
  - Track generation time trends

### Agent Utilization

Monitor resource usage per proof agent:

- **Metrics**: CPU usage per agent, memory allocation, GPU utilization (if applicable)
- **Use cases**:
  - Optimize agent allocation
  - Detect resource constraints
  - Load balancing across agents

### Throughput

Measure proof generation capacity:

- **Metrics**: Jobs completed per time period, proofs per second, utilization rate
- **Use cases**:
  - Capacity planning
  - Performance optimization
  - SLA monitoring

## System Metrics

Your node exposes standard infrastructure metrics through OpenTelemetry and the runtime environment.

### CPU Usage

Monitor process and system CPU utilization:

- **Metric**: `process_cpu_utilization`
- **Description**: Fraction of available CPU the process is using, already normalized across all cores. A value of `1.0` means every available core is fully busy; `0.7` means 70% of total CPU capacity. This is a gauge, so query it directly without `rate()`.

**Alert rules**:
```yaml
# process_cpu_utilization is a 0..1 ratio across all cores, so the threshold is
# a fraction of total capacity, not a core count. 0.7 = 70% of available CPU.
- alert: HighCPUUsage
  expr: process_cpu_utilization > 0.7
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High CPU usage detected"
    description: "Node using {{ $value | humanizePercentage }} of available CPU. Consider scaling resources."
```

### Memory Usage

Track RAM consumption:

- **Metric**: `process_memory_usage`
- **Description**: Resident (physical) memory the process is using, in bytes

**Alert rules**:
```yaml
- alert: HighMemoryUsage
  expr: process_memory_usage > 8000000000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage detected"
    description: "Memory usage is {{ $value | humanize1024 }}B. Consider increasing available RAM or investigating memory leaks."
```

**Additional monitoring**:
- Track memory growth rate to detect leaks
- Monitor garbage collection metrics for runtime efficiency

### Disk I/O

Monitor storage operations:

- **Metrics**: Disk read/write rates, I/O latency, disk utilization
- **Use cases**:
  - Identify I/O bottlenecks
  - Plan storage upgrades
  - Detect disk performance degradation

### Network Bandwidth

Track network throughput:

- **Metrics**: Bytes sent/received, packet rates, connection counts
- **Use cases**:
  - Monitor P2P bandwidth usage
  - Capacity planning for network resources
  - Detect unusual traffic patterns

## Creating Dashboards in Grafana

Organize your Grafana dashboards by operational focus to make monitoring efficient and actionable. For specific panel configurations and queries, see the [Grafana Setup](./grafana-setup.md) guide.

### Dashboard Organization Strategy

**Overview Dashboard** - At-a-glance health check
- L2 and L1 block height progression
- Peer connectivity status
- Critical alerts summary
- Resource utilization (CPU, memory)
- Use stat panels and gauges for current values
- Include time-series graphs for trends

**Performance Dashboard** - Deep-dive into operational metrics
- Block processing rates and latencies
- Transaction throughput
- Network bandwidth utilization
- Query response times
- Use percentile graphs (p50, p95, p99) for latency metrics
- Compare current performance against historical baselines

**Resource Dashboard** - Infrastructure monitoring
- CPU usage per core
- Memory allocation and garbage collection
- Disk I/O rates and latency
- Network packet rates
- Set threshold warning lines at 70-80% utilization
- Include growth trend projections

**Role-Specific Dashboards** - Specialized metrics by node type
- **Sequencer Dashboard**: Block proposals, attestations, committee participation, L1 publisher balance
- **Prover Dashboard**: Job queue depth, proof generation rates, agent utilization, success rates
- Focus on metrics unique to the role's responsibilities
- Include SLA tracking and performance benchmarks

## Best Practices

### Metric Collection

1. **Appropriate Scrape Intervals**: Balance data granularity against storage costs
   - Standard: 15s for most metrics
   - High-frequency: 5s for critical real-time metrics
   - Low-frequency: 60s for slow-changing metrics

2. **Retention Policy**: Configure based on operational needs
   - Short-term: 7-15 days for detailed troubleshooting
   - Long-term: 30-90 days for trend analysis
   - Archive: Consider downsampling for longer retention

3. **Label Cardinality**: Avoid high-cardinality labels that explode metric storage
   - Good: `instance`, `node_type`, `region`
   - Avoid: `user_id`, `transaction_hash`, `timestamp`

### Monitoring Strategy

1. **Layered Monitoring**: Monitor at multiple levels
   - Infrastructure: CPU, memory, disk, network
   - Application: Block height, peers, throughput
   - Business: Transaction success rate, user activity

2. **Proactive Alerts**: Set alerts before problems become critical
   - Use warning and critical thresholds
   - Alert on trends, not just absolute values
   - Reduce alert fatigue with proper tuning

3. **Dashboard Discipline**: Keep dashboards focused and actionable
   - Separate dashboards by role and concern
   - Include relevant context in panel titles
   - Add threshold lines and annotations

## Next Steps

- Explore advanced PromQL queries in the [Prometheus documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- Set up alerting rules following the [Prometheus alerting guide](https://prometheus.io/docs/alerting/latest/overview/)
- Configure notification channels in [Grafana](./grafana-setup.md)
- Return to [Monitoring Overview](./)
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community
