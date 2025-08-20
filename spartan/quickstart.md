# One time

From the repo root:

```
./bootstrap.sh
./spartan/bootstrap.sh
./spartan/bootstrap.sh kind
./spartan/scripts/create_k8s_dashboard.sh
./spartan/scripts/forward_k8s_dashboard.sh
```

Forward port 8443 however you please.

# Create a cluster

```
FRESH_INSTALL=false ./spartan/bootstrap.sh test-kind-smoke
```

That will give you an ethereum network with reth clients and an aztec network running on top with 1 validator.

The `FRESH_INSTALL=false` keeps the cluster alive after the test completes.

In the dashboard, you can select the "smoke" namespace and make sure it deploys.

### Running in dev container (DinD)

If the cluster is failing to start, it could be a DNS resolution error.
This patch replaces the core dns config with public resolvers during the bootstrap process.
This is a post cluster creation patch and therefore does not change the host's /etc/resolv.conf nor the kind-config.yaml.

```
KIND_FIX_DNS=true FRESH_INSTALL=false ./spartan/bootstrap.sh test-kind-smoke
```

### Destroying a cluster

```
kubectl delete namespace smoke
```

# Run Tests

```
FRESH_INSTALL=no-deploy ./spartan/scripts/test_k8s.sh kind src/spartan/transfer.test.ts 1-validators.yaml smoke
```

`FRESH_INSTALL=no-deploy` tells the runner to basically do nothing and just run the test.

This will create port forwards into your kind cluster so that jest (running on your local machine, i.e. outside the cluster) can access things properly.

Supplying `1-validator.yaml`, which is what was provided under the hood when the cluster was created ensures that tests use the same config as the cluster (e.g. slot and epoch durations).

The trailing `smoke` is to target the "smoke" namespace, i.e. where the aztec network was deployed.

# Running tests against GKE

```
AZTEC_REAL_PROOFS=1 FRESH_INSTALL=no-deploy ./spartan/scripts/test_k8s.sh gke src/spartan/transfer.test.ts rc-1.yaml next-rc-1
```

# New fancy modular flow

Install ethereum

```
cd spartan/eth-devnet
./create_genesis.sh
helm install ethereum . -n smoke --create-namespace

```
