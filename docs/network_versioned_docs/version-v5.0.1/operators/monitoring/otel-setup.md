---
title: OpenTelemetry Collector Setup
description: Configure OpenTelemetry Collector to receive metrics from your Aztec node and export them to Prometheus.
---

## Overview

The OpenTelemetry Collector receives metrics from your Aztec node and exports them to Prometheus for storage and analysis.

## Prerequisites

- A running Aztec node with Docker Compose
- Basic understanding of Docker networking

## Setup Steps

### Step 1: Create Configuration File

Create an `otel-collector-config.yml` file in the same directory as your existing `docker-compose.yml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
    metric_expiration: 5m

processors:
  batch:

service:
  pipelines:
    metrics:
      receivers: [otlp]
      exporters:
        - prometheus
```

This configuration:
- Receives metrics via OTLP (OpenTelemetry Protocol) on ports 4317 (gRPC) and 4318 (HTTP)
- Exports metrics to Prometheus format on port 8889
- Uses batch processing for efficiency

### Step 2: Add OTEL Collector to Docker Compose

Add the following to your existing `docker-compose.yml` file:

```yaml
services:
  # ... existing services ...
  otel-collector:
    image: otel/opentelemetry-collector
    container_name: aztec-otel
    ports:
      - 8888:8888  # OTEL collector metrics endpoint
      - 8889:8889  # Prometheus exporter endpoint
      - 4317:4317  # OTLP gRPC receiver
      - 4318:4318  # OTLP HTTP receiver
    volumes:
      - ./otel-collector-config.yml:/etc/otel-collector-config.yml
    command: >-
      --config=/etc/otel-collector-config.yml
    networks:
      - aztec
    restart: always
```

### Step 3: Configure Your Node to Export Metrics

Configure your Aztec node to export metrics to the OTEL collector.

**Step 3a: Add to .env file**

Add these variables to your `.env` file:

```bash
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
```

**Step 3b: Update docker-compose.yml**

Add these environment variables to your node's service in `docker-compose.yml`:

```yaml
services:
  aztec-node:  # or aztec-sequencer, prover-node, etc.
    # ... existing configuration ...
    environment:
      # ... existing environment variables ...
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: ${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}
```

**Network configuration:** Since your node and OTEL collector share the same Docker Compose file and `aztec` network, use the service name `otel-collector` in the endpoint URL as shown above.

### Step 4: Start Services

```bash
# Start or restart all services
docker compose up -d
```

### Step 5: Verify Metrics Collection

Check that metrics are being collected:

```bash
# View OTEL collector logs
docker compose logs -f otel-collector

# Query Prometheus endpoint
curl http://localhost:8889/metrics
```

You should see metrics in Prometheus format.

## Next Steps

- Proceed to [Prometheus Setup](./prometheus-setup.md) to configure metric storage and querying
- Return to [Monitoring Overview](./)
