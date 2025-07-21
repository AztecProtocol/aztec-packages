From the repo root:

```
# one time setup
./spartan/scripts/setup_local_k8s.sh
./spartan/scripts/create_k8s_dashboard.sh

# Go into spartan/metrics
./install.sh

# forward ports (in separate terminals)
./spartan/scripts/forward_k8s_dashboard.sh
./spartan/metrics/forward.sh

# build images locally
./bootstrap.sh image-e2e
```


From `yarn-project/end-to-end`
```
AZTEC_DOCKER_TAG=<the tag that was spit out> NAMESPACE=smoke FRESH_INSTALL=true VALUES_FILE="3-validators-with-metrics.yaml" ./scripts/network_test.sh ./src/spartan/smoke.test.ts
```

# Running in dev container (DinD)
If the cluster is failing to start, it could be a DNS resolution error.
This patch replaces the core dns config with public resolvers during the bootstrap process.
This is a post cluster creation patch and therefore does not change the host's /etc/resolv.conf nor the kind-config.yaml.
```
KIND_FIX_DNS=true
```
