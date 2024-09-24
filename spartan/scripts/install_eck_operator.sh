#!/bin/bash

set -ex

version=2.14.0

kubectl create -f https://download.elastic.co/downloads/eck/$version/crds.yaml
kubectl apply -f https://download.elastic.co/downloads/eck/$version/operator.yaml
