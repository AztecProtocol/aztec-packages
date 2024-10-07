#!/bin/bash
echo "Run this script after the metrics pods all come up. After running this script, port forward 3000 locally"
echo "Then navigate to https://localhost:3000 and login with user admin, and password as follows:"
echo
kubectl get secrets -n metrics metrics-grafana -o jsonpath='{.data.admin-password}' | base64 --decode
# skip two empty lines
echo
echo
kubectl port-forward -n metrics service/metrics-grafana 3000:80
