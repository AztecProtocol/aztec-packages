---
sidebar_position: 0
id: monitoring
title: Monitoring and Observability
description: Learn how to monitor your Aztec node with metrics, OpenTelemetry, Prometheus, and Grafana.
---

## Overview

This guide shows you how to set up monitoring and observability for your Aztec node using OpenTelemetry, Prometheus, and Grafana. Monitoring helps you maintain healthy node operations, diagnose issues quickly, and track performance over time.

:::info Docker Compose Setup
This monitoring setup is designed to work with Docker Compose deployments of Aztec nodes.
:::

## Architecture

The monitoring stack uses three components working together:

- **OpenTelemetry Collector**: Receives metrics from your Aztec node via OTLP protocol
- **Prometheus**: Stores and queries time-series metrics data
- **Grafana**: Visualizes metrics with dashboards and alerts

Your Aztec node exports metrics to the OpenTelemetry Collector, which processes and exposes them in a format Prometheus can scrape. Prometheus stores the metrics as time-series data, and Grafana queries Prometheus to create visualizations and alerts.

## Structured Logging

In addition to metrics, Aztec nodes support structured JSON logging for integration with log aggregation platforms. Structured logs make it easier to search, filter, and analyze log data at scale.

### Logging Options

Aztec supports several logging configurations:

| Environment Variable | Description |
|---------------------|-------------|
| `LOG_JSON=1` | Output logs as JSON to stderr for collection by external log aggregation tools. |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Export logs directly via OTLP protocol to an OpenTelemetry Collector. |
| `USE_GCLOUD_LOGGING=1` | Format logs for Google Cloud Logging with proper severity levels and trace context. |

### JSON Logging

To enable JSON-formatted logs, set the `LOG_JSON` environment variable:

```bash
LOG_JSON=1
```

When enabled, logs are output as JSON to stderr with the following structure:

```json
{"level":30,"time":1705312245123,"module":"p2p","msg":"Connected to peer","peerId":"QmX..."}
```

Log levels are numeric: `trace=10`, `debug=20`, `verbose=25`, `info=30`, `warn=40`, `error=50`, `fatal=60`.

### OTLP Log Export

For direct integration with an OpenTelemetry Collector, set the OTLP logs endpoint:

```bash
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://otel-collector:4318/v1/logs
```

This exports logs directly via OTLP protocol, allowing you to route them through your OTEL Collector configuration.

### Google Cloud Logging

For native Google Cloud Logging integration with proper severity mapping and trace context:

```bash
USE_GCLOUD_LOGGING=1
```

## Getting Started

Follow these guides in order to set up your complete monitoring stack:

1. [OpenTelemetry Collector Setup](./otel_setup.md) - Configure OTEL to receive metrics from your node
2. [Prometheus Setup](./prometheus_setup.md) - Set up Prometheus to store and query metrics
3. [Grafana Setup](./grafana_setup.md) - Configure Grafana for visualization and alerting
4. [Key Metrics Reference](./metrics_reference.md) - Understand the metrics your node exposes and create custom dashboards
5. [Complete Example and Troubleshooting](./monitoring_example_troubleshooting.md) - Full Docker Compose configuration and troubleshooting help

## Available Metrics Overview

Your Aztec node exposes metrics through OpenTelemetry to help you monitor performance and health. The metrics available depend on your node type (full node, sequencer, or prover) and version.

### Metric Categories

Your node exposes metrics in these categories:

- **Node Metrics**: Block height, sync status, peer count, and transaction processing
- **Sequencer Metrics**: Attestation activity, block proposals, and committee participation (sequencer nodes only)
- **Prover Metrics**: Job queue, proof generation, and agent utilization (prover nodes only)
- **System Metrics**: CPU, memory, disk I/O, and network bandwidth

For detailed information about each metric, PromQL queries, and dashboard creation, see the [Key Metrics Reference](./metrics_reference.md).

## Next Steps

Once your monitoring stack is running:

- Review the [Key Metrics Reference](./metrics_reference.md) to understand available metrics and PromQL queries
- Set up alerting rules in Prometheus for critical conditions
- Create custom dashboards tailored to your operational needs
- Configure notification channels (Slack, PagerDuty, email) in Grafana
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community

For troubleshooting common monitoring issues, see the [Complete Example and Troubleshooting](./monitoring_example_troubleshooting.md) guide.
