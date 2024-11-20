#!/bin/bash

# Delete all actively running chaos experiments
kubectl delete networkchaos,podchaos,iochaos,httpchaos --all --all-namespaces