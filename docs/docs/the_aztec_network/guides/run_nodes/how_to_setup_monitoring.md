# Enabling OpenTelemetry Metrics in Aztec Nodes

Aztec nodes support exporting metrics via [OpenTelemetry](https://opentelemetry.io/) (OTEL). This guide walks through setting up the OpenTelemetry Collector as a `systemd` service on the host machine and configuring your Aztec node to export metrics to it.

> 🛠️ This setup assumes:
> - You're running the Aztec node using `aztec-up` or `aztec start`
> - The OTEL Collector is running on the host and reachable from the container via the Docker bridge network (`172.17.0.1`)

---

## Step 1: Install OpenTelemetry Collector

Install the OpenTelemetry Collector on your host machine:

```bash
wget https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.92.0/otelcol-contrib_0.92.0_linux_amd64.tar.gz
tar -xvf otelcol-contrib_0.92.0_linux_amd64.tar.gz
sudo mv otelcol-contrib /usr/local/bin/
```

## Step 2: Create OTEL Collector config

Create a config file at `/etc/otelcol-contrib/config.yaml`

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: "172.17.0.1:4318"
      grpc:
        endpoint: "172.17.0.1:4317"

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
    const_labels:
      aztec_instance: "aztec-validator"
      aztec_host: "<YOUR_PUBLIC_IP>"

  logging:
    loglevel: info

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, logging]

    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]

    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]

  telemetry:
    logs:
      level: "info"
```

## Step 3: Create a systemd Service for OTEL
Create a file at /etc/systemd/system/otelcol-contrib.service

```ini
[Unit]
Description=OpenTelemetry Collector
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/otelcol-contrib --config=/etc/otelcol-contrib/config.yaml
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

```

Run the otel service

```bash
sudo systemctl daemon-reexec
sudo systemctl enable otelcol-contrib
sudo systemctl start otelcol-contrib
sudo systemctl status otelcol-contrib

```



## Step 4: Start Aztec Node with Telemetry Enabled

In this example, the OTEL Collector is running as a `systemd` service on the host machine and bound to `172.17.0.1:4318` (the default Docker bridge IP). This allows the containerized Aztec process to connect back to the host.
> ⚠️ **Note**: If your OTEL Collector is running elsewhere (e.g., in Docker or on another host), make sure to update the IP and port accordingly.

```bash
aztec-up alpha-testnet

export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://172.17.0.1:4318/v1/metrics
export OTEL_EXPORTER_TIMEOUT_MS=60000
export OTEL_EXPORTER_COLLECT_INTERVAL_MS=120000

aztec start --node --network alpha-testnet
    --l1-rpc-urls ...
    --l1-consensus-host-urls ...
    --l1-consensus-host-api-keys ...
    --l1-consensus-host-api-key-headers X...
    --p2p.p2pIp $IP
    --tel.metricsCollectorUrl $OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
    --tel.otelCollectIntervalMs $OTEL_EXPORTER_COLLECT_INTERVAL_MS
    --tel.otelExportTimeoutMs $OTEL_EXPORTER_TIMEOUT_MS
```


## Step 5: View Metrics

```bash
curl http://localhost:8889/metrics
```
