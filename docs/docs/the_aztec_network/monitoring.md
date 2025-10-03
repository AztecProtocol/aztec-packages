---
sidebar_position: 5
title: Monitoring and Observability
description: Learn how to monitor your Aztec node with metrics, OpenTelemetry, Prometheus, and Grafana.
---

## Overview

This guide covers how to set up monitoring and observability for your Aztec node using OpenTelemetry, Prometheus, and Grafana. Proper monitoring is essential for maintaining healthy node operations and diagnosing issues.

## Architecture

Aztec nodes expose metrics via OpenTelemetry (OTEL) which can be collected, stored, and visualized using standard observability tools:

- **OpenTelemetry Collector**: Receives metrics from Aztec nodes via OTLP protocol
- **Prometheus**: Stores and queries time-series metrics data
- **Grafana**: Visualizes metrics with dashboards and alerts

## Key Metrics

Aztec nodes expose various metrics to help you monitor performance and health. The exact metrics and their names depend on your node type and version.

### Node Metrics

Key areas to monitor for all node types:

- **Block height**: Track sync progress and current blockchain state
- **Sync status**: Monitor whether the node is catching up or fully synced
- **Peer count**: Number of P2P connections to other nodes
- **Transaction processing**: Mempool size and transaction throughput

### Sequencer Metrics

Important metrics for sequencer operators:

- **Attestation activity**: Track attestation submissions and participation
- **Block proposals**: Monitor proposal success and timing
- **Committee participation**: Track involvement in consensus duties
- **Performance metrics**: Block production time and latency

### Prover Metrics

Critical metrics for prover operators:

- **Job queue**: Monitor pending proof generation work
- **Proof generation**: Track completion time and success rate
- **Agent utilization**: CPU, memory, and resource usage per agent
- **Throughput**: Jobs completed per time period

### System Metrics

Standard infrastructure metrics available for all node types:

- **CPU usage**: Process and system-level utilization
- **Memory usage**: RAM consumption and allocation
- **Disk I/O**: Storage operations and throughput
- **Network bandwidth**: Inbound and outbound traffic

:::tip
The specific metric names will be visible in the Prometheus UI once your node is exporting metrics. Use the metrics explorer to discover available metrics and their labels.
:::

## OpenTelemetry Collector Setup

The OpenTelemetry Collector receives metrics from your Aztec node and exports them to Prometheus.

### Step 1: Create Configuration File

Create an `otel-collector-config.yaml` file:

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

Add the following to your existing `docker-compose.yml` file (or create a new one for monitoring):

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector
    container_name: aztec-otel
    ports:
      - 8888:8888  # OTEL collector metrics endpoint
      - 8889:8889  # Prometheus exporter endpoint
      - 4317:4317  # OTLP gRPC receiver
      - 4318:4318  # OTLP HTTP receiver
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    command: >-
      --config=/etc/otel-collector-config.yaml
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

### Step 3: Configure Node to Export Metrics

Update your Aztec node's environment variables to export metrics to the OTEL collector.

**Step 3a: Add to .env file**

Add these variables to your `.env` file:

```bash
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
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
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}
```

:::note Network Configuration
If your node and OTEL collector are in the same Docker Compose file and share the `aztec` network, use the service name `otel-collector` in the endpoint URL (as shown above).

If they're in separate Docker Compose files or on different machines, replace `otel-collector` with the IP address or hostname of the machine running the OTEL collector:
- `http://<OTEL_COLLECTOR_MACHINE_IP>:4318/v1/metrics`
- `http://<OTEL_COLLECTOR_MACHINE_IP>:4318/v1/traces`
:::

### Step 4: Start Services

**If OTEL collector and node are in the same docker-compose.yml:**

```bash
# Start or restart all services
docker compose up -d
```

**If OTEL collector is in a separate docker-compose.yml:**

```bash
# In the OTEL collector directory
docker compose up -d otel-collector

# In your node directory, restart the node
docker compose restart aztec-node
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

## Prometheus Setup

Prometheus scrapes and stores the metrics exposed by the OTEL collector.

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

networks:
  aztec:
    name: aztec
```

### Step 3: Start Prometheus

```bash
docker compose up -d prometheus
```

### Step 4: Verify Prometheus

Access Prometheus UI at `http://localhost:9090` and verify:
1. Go to **Status → Targets** to check that `aztec-node` target is up
2. Go to **Graph** and query a metric (e.g., `aztec_node_block_height`)

## Grafana Setup

Grafana provides rich visualization and alerting capabilities for your metrics.

### Step 1: Add Grafana to Docker Compose

Add Grafana to your `docker-compose.yml`:

```yaml
services:
  # ... existing services (otel-collector, prometheus, etc.) ...

  grafana:
    image: grafana/grafana:latest
    container_name: aztec-grafana
    ports:
      - 3000:3000
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    networks:
      - aztec
    restart: always

volumes:
  prometheus-data:
  grafana-data:

networks:
  aztec:
    name: aztec
```

:::warning
Change the default admin password (`GF_SECURITY_ADMIN_PASSWORD`) to a secure value for production deployments.
:::

### Step 2: Start Grafana

```bash
docker compose up -d grafana
```

### Step 3: Access Grafana

1. Navigate to `http://localhost:3000`
2. Login with username `admin` and the password you set (default: `admin`)
3. You'll be prompted to change the password on first login

### Step 4: Add Prometheus Data Source

1. In the left sidebar, click **Connections** → **Data sources**
2. Click **Add data source**
3. Search for and select **Prometheus**
4. Configure:
   - **Name**: Aztec Prometheus
   - **URL**: `http://prometheus:9090`
5. Click **Save & Test**

You should see a green success message confirming Grafana can connect to Prometheus.

### Step 5: Create a Dashboard

#### Option 1: Create a Basic Dashboard

1. In the left sidebar, click **Dashboards**
2. Click **New** → **New Dashboard**
3. Click **Add visualization**
4. Select your **Aztec Prometheus** data source
5. In the query editor, enter a metric (explore available metrics using the autocomplete)
6. Customize the visualization type and settings
7. Click **Apply**
8. Click **Save dashboard** icon (top right)
9. Give your dashboard a name and click **Save**

#### Option 2: Import a Pre-built Dashboard

If the Aztec community has created shared dashboards:

1. Click **+** → **Import**
2. Enter dashboard ID or upload JSON file
3. Select **Aztec Prometheus** as the data source
4. Click **Import**

### Step 6: Set Up Alerts

Configure alerts to notify you of issues:

1. In the left sidebar, click **Alerting** (bell icon)
2. Click **Alert rules** → **New alert rule**
3. Configure your alert:
   - **Query**: Select your Prometheus data source and metric (e.g., `aztec_node_block_height`)
   - **Condition**: Define the threshold (e.g., `rate(aztec_node_block_height[5m]) < 0.001` to alert if no blocks in 5 minutes)
   - **Evaluation interval**: How often to check (e.g., 1m)
4. Add contact points (email, Slack, PagerDuty, etc.) under **Contact points**
5. Create notification policies to route alerts to contact points
6. Click **Save**

## Complete Docker Compose Example

Here's a complete example with all monitoring components:

```yaml
services:
  # Your Aztec node (example for full node)
  aztec-node:
    image: "aztecprotocol/aztec:latest"
    container_name: "aztec-node"
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data
    environment:
      DATA_DIRECTORY: /var/lib/data
      LOG_LEVEL: ${LOG_LEVEL}
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: http://otel-collector:4318/v1/metrics
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://otel-collector:4318/v1/traces
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --network testnet
    networks:
      - aztec
    restart: always

  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector
    container_name: aztec-otel
    ports:
      - 8888:8888
      - 8889:8889
      - 4317:4317
      - 4318:4318
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    command: >-
      --config=/etc/otel-collector-config.yaml
    networks:
      - aztec
    restart: always

  # Prometheus
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

  # Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: aztec-grafana
    ports:
      - 3000:3000
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-secure-password
      - GF_USERS_ALLOW_SIGN_UP=false
    networks:
      - aztec
    restart: always

volumes:
  prometheus-data:
  grafana-data:

networks:
  aztec:
    name: aztec
```

## Metrics Reference

### Available Metrics

Aztec nodes expose metrics via the OpenTelemetry protocol. The exact metrics available depend on your node type and version.

:::note
Metric names in this guide are examples and may not exactly match the actual metrics exposed by Aztec nodes. Use the Prometheus UI to explore available metrics by browsing to `http://localhost:9090/graph` and typing in the query box to see autocomplete suggestions.
:::

Common metric patterns to look for:

- Node and archiver metrics
- Sequencer-specific metrics
- Prover-specific metrics
- P2P networking metrics
- System metrics (CPU, memory, etc.)

### Querying Metrics

Use Prometheus Query Language (PromQL) to query metrics. Here are some example query patterns (actual metric names may vary):

**Example queries:**

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

:::tip Finding Metrics
To discover actual metric names:
1. Go to Prometheus UI at `http://localhost:9090/graph`
2. Click the metrics explorer icon or start typing in the query box
3. Browse the available metrics and their labels
4. Use the autocomplete feature to find relevant metrics
:::

### Useful Dashboard Panels

Example panels you can create (adjust metric names based on what's actually available):

1. **Block Height Over Time**: Line graph tracking block sync progress
2. **Sync Rate**: Line graph showing blocks per second (use `rate()` function)
3. **Peer Count**: Gauge showing P2P connections
4. **Memory Usage**: Line graph of `process_resident_memory_bytes`
5. **CPU Usage**: Line graph of `rate(process_cpu_seconds_total[5m])`

## Troubleshooting

### Metrics not appearing

**Issue**: No metrics showing in Prometheus or Grafana.

**Solutions**:
- Verify OTEL collector is running: `docker compose ps otel-collector`
- Check OTEL collector logs: `docker compose logs otel-collector`
- Verify node is configured with correct OTEL endpoints
- Test OTEL collector endpoint: `curl http://localhost:8889/metrics`
- Ensure all containers are on the same Docker network

### Prometheus target down

**Issue**: Prometheus shows target as "down" in Status → Targets.

**Solutions**:
- Verify OTEL collector is running and exposing port 8889
- Check Prometheus configuration in `prometheus.yml`
- Ensure target address is correct (use service name if in same Docker network)
- Review Prometheus logs: `docker compose logs prometheus`

### Grafana cannot connect to Prometheus

**Issue**: Grafana shows "Bad Gateway" or cannot query Prometheus.

**Solutions**:
- Verify Prometheus is running: `docker compose ps prometheus`
- Check data source URL in Grafana (should be `http://prometheus:9090`)
- Test Prometheus endpoint: `curl http://localhost:9090/api/v1/query?query=up`
- Ensure Grafana and Prometheus are on the same Docker network

## Next Steps

- Set up alerting rules in Prometheus for critical conditions
- Create custom dashboards for your specific monitoring needs
- Configure notification channels (Slack, PagerDuty, email) in Grafana
- Explore advanced PromQL queries for deeper insights
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community
