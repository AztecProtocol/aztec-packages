From the repo root:

```
# one time setup
./spartan/scripts/setup_local_k8s.sh
./spartan/scripts/create_k8s_dashboard.sh
./spartan/metrics/install.sh

# forward ports (in separate terminals)
./spartan/scripts/forward_k8s_dashboard.sh
./spartan/metrics/forward.sh

# build images locally
# this takes forever but a massive speedup is coming
./scripts/earthly-local ./yarn-project/+export-e2e-test-images
```


From `yarn-project/end-to-end`
```
AZTEC_DOCKER_TAG=<the tag that was spit out> NAMESPACE=smoke FRESH_INSTALL=true VALUES_FILE="3-validators-with-metrics.yaml" ./scripts/network_test.sh ./src/spartan/smoke.test.ts
```