#!/bin/bash
echo "Run this script after the metrics pods all come up. After running this script, port forward 5601 locally"
echo "Then navigate to https://localhost:5601 and login with user elastic password admin"
kubectl port-forward -n metrics service/metrics-eck-kibana-kb-http 5601:5601