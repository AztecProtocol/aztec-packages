---
sidebar_position: 4
title: Complete Example and Troubleshooting
description: Complete Docker Compose example with all monitoring components and troubleshooting guide for common monitoring issues.
---

## Complete Docker Compose Example

Here's a complete example with all monitoring components integrated with your Aztec node:

```yaml
services:
  # Your Aztec node (example for full node)
  aztec-node:
    image: "aztecprotocol/aztec:2.0.2"
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

This configuration includes:
- Your Aztec node configured to export metrics to the OTEL collector
- OpenTelemetry Collector to receive and process metrics
- Prometheus to store time-series data with 30-day retention
- Grafana for visualization and alerting
- Persistent volumes for Prometheus and Grafana data
- All services on the same Docker network for easy communication

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
