---
title: Prometheus Setup
description: Configure Prometheus to scrape and store metrics from your Aztec node's OpenTelemetry Collector.
---

## Overview

Prometheus scrapes and stores the metrics exposed by the OTEL collector, providing a time-series database for querying and analysis.

## Prerequisites

- Completed [OpenTelemetry Collector Setup](./otel_setup.md)
- OTEL collector running and exposing metrics on port 8889

## Setup Steps

### Step 1: Create Prometheus Configuration

Create a `prometheus.yml` file:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aztec-node'
    static_configs:
      - targets: ['otel-collector:8889']
        labels:
          instance: 'aztec-node-1'
```

Adjust the `instance` label to identify your node uniquely if you're running multiple nodes.

### Step 2: Add Prometheus to Docker Compose

Add Prometheus to your `docker-compose.yml`:

```yaml
services:
  # ... existing services (otel-collector, etc.) ...

  prometheus:
    image: prom/prometheus:latest
    container_name: aztec-prometheus
    ports:
      - 9090:9090
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - aztec
    restart: always

volumes:
  prometheus-data:
```

### Step 3: Start Prometheus

```bash
docker compose up -d
```

### Step 4: Verify Prometheus

Access Prometheus UI at `http://localhost:9090` and verify:
1. Go to **Status → Target Health** to check that `aztec-node` target is up
2. Go to **Graph** and query a metric (e.g., `aztec_archiver_block_height`)

## Using Prometheus

### Query Metrics

Use the Prometheus UI to explore and query metrics:

1. Navigate to `http://localhost:9090/graph`
2. Enter a metric name in the query box (use autocomplete to discover available metrics)
3. Click **Execute** to see the results
4. Switch between **Table** and **Graph** views

### Example Queries

```promql
# Current block height
aztec_archiver_block_height

# Block sync rate (blocks per second)
rate(aztec_archiver_block_height[5m])

# Memory usage
process_resident_memory_bytes

# CPU usage rate
rate(process_cpu_seconds_total[5m])
```

## Next Steps

- Proceed to [Grafana Setup](./grafana_setup.md) to configure visualization and alerting
- Return to [Monitoring Overview](./monitoring.md)
