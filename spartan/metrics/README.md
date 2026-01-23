This is a chart intended to be installed once per k8s cluster, and provides monitoring for all aztec network deployments within the cluster.

## Installation

```bash
# From the spartan/metrics directory
./install.sh
```

## Access
```bash
# From the spartan/metrics directory
./forward.sh
```

Follow the instructions printed to access the dashboard.

## How does it work

This chart installs:
  - a daemonset of otel-collectors
    - These automatically gather all logs from all pods in the cluster
    - Aztec nodes also push metrics and traces to these collectors
  - a prometheus instance
    - This scrapes metrics from the otel-collectors
  - a loki instance
    - This stores logs from the otel-collectors
  - a tempo instance
    - This stores traces from the otel-collectors
  - a grafana instance
    - This provides a dashboard for the metrics, logs, and traces
