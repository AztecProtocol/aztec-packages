---
title: Grafana Setup
description: Configure Grafana to visualize Aztec node metrics and set up alerts for monitoring your node's health.
---

## Overview

Grafana provides rich visualization and alerting capabilities for your metrics, allowing you to create custom dashboards and receive notifications when issues arise.

## Prerequisites

- Completed [Prometheus Setup](./prometheus_setup.md)
- Prometheus running and accessible at `http://prometheus:9090`

## Setup Steps

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
  # ... existing volumes  ...
  grafana-data:

networks:
  aztec:
    name: aztec
```

:::warning Admin Password Security
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

## Creating Dashboards

### Option 1: Create a Basic Dashboard

1. In the left sidebar, click **Dashboards**
2. Click **New** → **New Dashboard**
3. Click **Add visualization**
4. Select your **Aztec Prometheus** data source
5. In the query editor, enter a metric (explore available metrics using the autocomplete)
6. Customize the visualization type and settings
7. Click **Apply**
8. Click **Save dashboard** icon (top right)
9. Give your dashboard a name and click **Save**

### Option 2: Import a Pre-built Dashboard

If the Aztec community has created shared dashboards:

1. Click **+** → **Import**
2. Enter dashboard ID or upload JSON file
3. Select **Aztec Prometheus** as the data source
4. Click **Import**

### Recommended Dashboard Panels

Example panels you can create (adjust metric names based on what's actually available):

1. **Block Height Over Time**: Line graph tracking block sync progress
2. **Sync Rate**: Line graph showing blocks per second (use `rate()` function)
3. **Peer Count**: Gauge showing P2P connections
4. **Memory Usage**: Line graph of `process_resident_memory_bytes`
5. **CPU Usage**: Line graph of `rate(process_cpu_seconds_total[5m])`

## Setting Up Alerts

Configure alerts to notify you of issues:

### Step 1: Create an Alert Rule

1. In the left sidebar, click **Alerting** (bell icon)
2. Click **Alert rules** → **New alert rule**
3. Configure your alert:
   - **Query**: Select your Prometheus data source and metric (e.g., `aztec_node_block_height`)
   - **Condition**: Define the threshold (e.g., `rate(aztec_node_block_height[5m]) < 0.001` to alert if no blocks in 5 minutes)
   - **Evaluation interval**: How often to check (e.g., 1m)
4. Click **Save**

### Step 2: Configure Contact Points

1. Under **Alerting**, click **Contact points**
2. Click **Add contact point**
3. Choose your notification method:
   - **Email**: Configure SMTP settings
   - **Slack**: Add webhook URL
   - **PagerDuty**: Add integration key
   - **Webhook**: Custom HTTP endpoint
4. Click **Save**

### Step 3: Create Notification Policies

1. Under **Alerting**, click **Notification policies**
2. Click **New notification policy**
3. Define routing rules to send alerts to specific contact points
4. Click **Save**

## Example Alert Rules

### Node Sync Alert

Alert if the node stops syncing blocks:

- **Query**: `rate(aztec_archiver_block_height[5m])`
- **Condition**: `< 0.001`
- **Description**: Node has not synced any blocks in the last 5 minutes

### High Memory Usage Alert

Alert if memory usage exceeds threshold:

- **Query**: `process_memory_usage`
- **Condition**: `> 8000000000` (8GB)
- **Description**: Node memory usage exceeds 8GB

### Peer Connection Alert

Alert if peer count drops too low:

- **Query**: `discv5_connected_peer_count`
- **Condition**: `< 3`
- **Description**: Node has fewer than 3 peer connections

## Next Steps

- Explore the [Monitoring Overview](./monitoring.md) for troubleshooting and metrics reference
- Join the [Aztec Discord](https://discord.gg/aztec) to share dashboards with the community
- Configure additional notification channels for your alerts
