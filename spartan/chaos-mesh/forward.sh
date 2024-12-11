#!/bin/bash

# Forward chaos-mesh dashboard to local port 2333
kubectl port-forward svc/chaos-dashboard 2333:2333 -n chaos-mesh

echo "Chaos-mesh dashboard is now available at http://localhost:2333"