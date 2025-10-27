---
sidebar_position: 0
id: monitoring
title: Monitoring and Observability
description: Learn how to monitor your Aztec node with metrics, OpenTelemetry, Prometheus, and Grafana.
---

## Overview

This guide covers how to set up monitoring and observability for your Aztec node using OpenTelemetry, Prometheus, and Grafana. Proper monitoring helps you maintain healthy node operations, diagnose issues quickly, and track performance over time.

:::warning Docker Compose Required
This monitoring setup only works with the Docker Compose method of running your Aztec node.
:::

## Architecture

The monitoring stack uses three components working together:

- **OpenTelemetry Collector**: Receives metrics from your Aztec node via OTLP protocol
- **Prometheus**: Stores and queries time-series metrics data
- **Grafana**: Visualizes metrics with dashboards and alerts

Your Aztec node exports metrics to the OpenTelemetry Collector, which processes and exposes them in a format Prometheus can scrape. Prometheus stores the metrics as time-series data, and Grafana queries Prometheus to create visualizations and alerts.

## Getting Started

Follow these guides in order to set up your complete monitoring stack:

1. [OpenTelemetry Collector Setup](./otel_setup.md) - Configure OTEL to receive metrics from your node
2. [Prometheus Setup](./prometheus_setup.md) - Set up Prometheus to store and query metrics
3. [Grafana Setup](./grafana_setup.md) - Configure Grafana for visualization and alerting
4. [Complete Example and Troubleshooting](./monitoring_example_troubleshooting.md) - Full Docker Compose configuration and troubleshooting help

After completing the setup, you can explore the metrics your node exposes and create custom dashboards.

## Understanding Available Metrics

Aztec nodes expose various metrics to help you monitor performance and health. The exact metrics and their names depend on your node type and version.

:::tip Discovering Metrics
Once your monitoring stack is running, you can discover available metrics in the Prometheus UI at `http://localhost:9090/graph`. Start typing in the query box to see autocomplete suggestions for metrics exposed by your node.
:::

### Node Metrics

All node types expose metrics for:

- **Block height**: Track sync progress and current blockchain state
- **Sync status**: Monitor whether the node is catching up or fully synced
- **Peer count**: Number of P2P connections to other nodes
- **Transaction processing**: Mempool size and transaction throughput

### Sequencer Metrics

If you're running a sequencer, monitor these additional metrics:

- **Attestation activity**: Track attestation submissions and participation
- **Block proposals**: Monitor proposal success and timing
- **Committee participation**: Track involvement in consensus duties
- **Performance metrics**: Block production time and latency

### Prover Metrics

Prover operators should track:

- **Job queue**: Monitor pending proof generation work
- **Proof generation**: Track completion time and success rate
- **Agent utilization**: CPU, memory, and resource usage per agent
- **Throughput**: Jobs completed per time period

### System Metrics

All node types expose standard infrastructure metrics:

- **CPU usage**: Process and system-level utilization
- **Memory usage**: RAM consumption and allocation
- **Disk I/O**: Storage operations and throughput
- **Network bandwidth**: Inbound and outbound traffic

## Working with Metrics

### Querying with PromQL

Prometheus Query Language (PromQL) lets you query and analyze your metrics. Here are some example patterns:

```promql
# Current block height (example - actual metric name may differ)
aztec_node_block_height

# Rate of blocks synced per second
rate(aztec_node_block_height[5m])

# Memory usage (standard process metric)
process_resident_memory_bytes

# CPU usage (standard process metric)
rate(process_cpu_seconds_total[5m])
```

**Note:** Metric names in this guide are examples. Use the Prometheus UI to explore the actual metrics your node exposes by browsing to `http://localhost:9090/graph` and using the query box autocomplete.

### Creating Dashboards

In Grafana, you can create panels to visualize your metrics. Here are some useful starting points:

1. **Block Height Over Time**: Line graph tracking sync progress
2. **Sync Rate**: Line graph showing blocks per second (using `rate()` function)
3. **Peer Count**: Gauge showing P2P connections
4. **Memory Usage**: Line graph of `process_resident_memory_bytes`
5. **CPU Usage**: Line graph of `rate(process_cpu_seconds_total[5m])`

Adjust metric names based on what your node actually exposes. The Prometheus metrics explorer helps you discover the correct names and labels.

## Next Steps

Once your monitoring stack is running:

- Set up alerting rules in Prometheus for critical conditions
- Create custom dashboards tailored to your operational needs
- Configure notification channels (Slack, PagerDuty, email) in Grafana
- Explore advanced PromQL queries for deeper insights
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community

For troubleshooting common monitoring issues, see the [Complete Example and Troubleshooting](./monitoring_example_troubleshooting.md) guide.
