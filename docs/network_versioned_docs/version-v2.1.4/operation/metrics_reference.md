---
title: Key Metrics Reference
description: Comprehensive guide to understanding and using the metrics exposed by your Aztec node for monitoring and observability.
references: ["yarn-project/aztec-node/src/aztec-node/node_metrics.ts", "yarn-project/sequencer-client/src/sequencer/metrics.ts", "yarn-project/prover-node/src/metrics.ts", "yarn-project/archiver/src/archiver/instrumentation.ts"]
---

## Overview

Your Aztec node exposes metrics through OpenTelemetry to help you monitor performance, health, and operational status. This guide covers key metrics across node types and how to use them effectively.

:::tip Discovering Metrics
Once your monitoring stack is running, you can discover available metrics in the Prometheus UI at `http://localhost:9090/graph`. Start typing in the query box to see autocomplete suggestions for metrics exposed by your node.
:::

## Prerequisites

- Complete monitoring stack setup following the [Monitoring Overview](./monitoring.md)
- Ensure Prometheus is running and scraping metrics from your OTEL collector
- Verify access to Prometheus UI at `http://localhost:9090`

:::warning Metric Names May Vary
The exact metric names and labels in this guide depend on your node type, version, and configuration. Always verify the actual metrics exposed by your node using the Prometheus UI metrics explorer at `http://localhost:9090/graph`. Common prefixes: `aztec_archiver_*`, `aztec_sequencer_*`, `aztec_prover_*`, `process_*`.
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
rate(process_cpu_seconds_total[5m])

# Blocks synced over time window (for gauges)
increase(aztec_archiver_block_height[1h])

# Derivative - per-second change rate of gauges
deriv(process_resident_memory_bytes[30m])
```

### Arithmetic Operations

Calculate derived metrics using basic math operators:

```promql
# Calculate percentage (block proposal failure rate)
(increase(aztec_sequencer_slot_count[15m]) - increase(aztec_sequencer_slot_filled_count[15m]))
/ increase(aztec_sequencer_slot_count[15m])

# Convert to percentage scale
rate(process_cpu_seconds_total[5m]) * 100
```

### Comparison Operators

Filter and alert based on thresholds:

```promql
# Greater than
rate(process_cpu_seconds_total[5m]) > 2.8

# Less than
aztec_peer_manager_peer_count_peers < 5

# Equal to
increase(aztec_archiver_block_height[15m]) == 0

# Not equal to
aztec_sequencer_current_state != 1
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

- **Metric**: `aztec_l1_block_height`
- **Description**: Latest L1 (Ethereum) block number seen by the node

**Alert rule**:
```yaml
- alert: L1BlockHeightNotIncreasing
  expr: increase(aztec_l1_block_height[15m]) == 0
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

### Sequencer State

Monitor the operational state of the sequencer module:

- **Metric**: `aztec_sequencer_current_state`
- **Description**: Current state of the sequencer module (1 = OK/running, 0 = stopped/error)

**Alert rule**:
```yaml
- alert: SequencerNotHealthy
  expr: aztec_sequencer_current_state != 1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Sequencer module not in healthy state"
    description: "Sequencer state is {{ $value }} (expected 1). Check sequencer logs immediately."
```

### Block Proposal Failures

Track failed block proposals by comparing slots to filled slots:

- **Metrics**: `aztec_sequencer_slot_count` and `aztec_sequencer_slot_filled_count`
- **Description**: Tracks slots assigned to your sequencer versus slots successfully filled. Alert triggers when the failure rate exceeds 5% over 15 minutes.

**Alert rule**:
```yaml
- alert: HighBlockProposalFailureRate
  expr: |
    (increase(aztec_sequencer_slot_count[15m]) - increase(aztec_sequencer_slot_filled_count[15m]))
    / increase(aztec_sequencer_slot_count[15m]) > 0.05
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

- **Metric**: `process_cpu_seconds_total`
- **Description**: Cumulative CPU time consumed by the process in seconds

**Alert rules**:
```yaml
# Note: Adjust thresholds based on your system's CPU core count.
# Example below assumes a 4-core system (70% = 2.8 cores, 85% = 3.4 cores)
- alert: HighCPUUsage
  expr: rate(process_cpu_seconds_total[5m]) > 2.8
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High CPU usage detected"
    description: "Node using {{ $value }} CPU cores (above 2.8 threshold). Consider scaling resources."
```

### Memory Usage

Track RAM consumption:

- **Metric**: `process_resident_memory_bytes`
- **Description**: Resident memory size in bytes

**Alert rules**:
```yaml
- alert: HighMemoryUsage
  expr: process_resident_memory_bytes > 8000000000
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

Organize your Grafana dashboards by operational focus to make monitoring efficient and actionable. For specific panel configurations and queries, see the [Grafana Setup](./grafana_setup.md) guide.

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
- Configure notification channels in [Grafana](./grafana_setup.md)
- Return to [Monitoring Overview](./monitoring.md)
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community
