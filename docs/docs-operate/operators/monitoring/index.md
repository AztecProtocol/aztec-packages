---
displayed_sidebar: operatorsSidebar
id: monitoring
title: Monitoring and Observability
description: Learn how to monitor your Aztec node with metrics, OpenTelemetry, Prometheus, and Grafana.
references: ["yarn-project/telemetry-client/src/metrics.ts", "yarn-project/telemetry-client/src/config.ts"]
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

## Getting Started

Follow these guides in order to set up your complete monitoring stack:

1. [OpenTelemetry Collector Setup](./otel-setup.md) - Configure OTEL to receive metrics from your node
2. [Prometheus Setup](./prometheus-setup.md) - Set up Prometheus to store and query metrics
3. [Grafana Setup](./grafana-setup.md) - Configure Grafana for visualization and alerting
4. [Key Metrics Reference](./metrics-reference.md) - Understand the metrics your node exposes and create custom dashboards
5. [Complete Example and Troubleshooting](./troubleshooting.md) - Full Docker Compose configuration and troubleshooting help

## Available Metrics Overview

Your Aztec node exposes metrics through OpenTelemetry to help you monitor performance and health. The metrics available depend on your node type (full node, sequencer, or prover) and version.

### Metric Categories

Your node exposes metrics in these categories:

- **Node Metrics**: Block height, sync status, peer count, and transaction processing
- **Sequencer Metrics**: Attestation activity, block proposals, and committee participation (sequencer nodes only)
- **Prover Metrics**: Job queue, proof generation, and agent utilization (prover nodes only)
- **System Metrics**: CPU, memory, disk I/O, and network bandwidth

For detailed information about each metric, PromQL queries, and dashboard creation, see the [Key Metrics Reference](./metrics-reference.md).

## Next Steps

Once your monitoring stack is running:

- Review the [Key Metrics Reference](./metrics-reference.md) to understand available metrics and PromQL queries
- Set up alerting rules in Prometheus for critical conditions
- Create custom dashboards tailored to your operational needs
- Configure notification channels (Slack, PagerDuty, email) in Grafana
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community

For troubleshooting common monitoring issues, see the [Troubleshooting](./troubleshooting.md) guide.
