---
name: local-network-testing
description: Deploy and test Aztec networks locally using KIND or GCP infrastructure. Covers KIND setup, GCP authentication, environment configuration, and tips for faster iteration.
---

# Local Network Testing

## When to Use

Use this skill when:
- Deploying a test network to run spartan/e2e tests against
- Debugging network-level issues that require a multi-node setup
- Testing upgrades, governance, or validator behavior
- Running performance benchmarks on a realistic network

## Quick Start: KIND (Local Kubernetes)

KIND (Kubernetes IN Docker) lets you run a full Aztec network locally without GCP access.

### Setup KIND Cluster

```bash
cd spartan

# Create KIND cluster (one-time)
./bootstrap.sh kind

# Verify cluster is running
kubectl cluster-info --context kind-kind
```

### Build and Load Docker Image

```bash
# Build the aztec docker image
cd /path/to/aztec-packages
EARTHLY_BUILD_ARGS="DEVNET_TEST=true" ./spartan/bootstrap.sh build

# Get the image tag (commit hash)
IMAGE_TAG=$(git rev-parse HEAD)

# Load image into KIND (required - KIND can't pull from local docker)
kind load docker-image aztecprotocol/aztec:$IMAGE_TAG
```

### Create Environment File

Create `spartan/environments/kind-test.env`:

```bash
# KIND cluster configuration
CLUSTER=kind
NAMESPACE=my-test

# Docker image (use your built image tag)
AZTEC_DOCKER_IMAGE=aztecprotocol/aztec:<your-commit-hash>

# L1 devnet
CREATE_ETH_DEVNET=true
ETHEREUM_CHAIN_ID=1337

# Network configuration
VALIDATOR_REPLICAS=4
VALIDATORS_PER_NODE=12
PROVER_REPLICAS=1

# Fast bootstrap (recommended for local testing)
AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=1
AZTEC_EPOCH_DURATION=16

# Disable tests (deploy only)
RUN_TESTS=false

# Resource profile for KIND
RESOURCE_PROFILE=dev
```

### Deploy Network

```bash
cd spartan
./bootstrap.sh network_deploy kind-test
```

### Verify Deployment

```bash
# Check all pods are Running
kubectl get pods -n my-test

# Check validator logs for block production
kubectl logs -n my-test my-test-validator-0 -c aztec --tail=50 | grep -E "slot|block"
```

### Tear Down

```bash
# Delete namespace
kubectl delete namespace my-test

# Clean terraform state (important for fresh redeploys)
rm -rf spartan/terraform/deploy-*/state
rm -rf spartan/terraform/deploy-*/.terraform

# Or delete entire KIND cluster
kind delete cluster
```

## KIND Troubleshooting

### ImagePullBackOff Errors

KIND can't pull images from Docker Hub by default. Load images manually:

```bash
kind load docker-image aztecprotocol/aztec:$IMAGE_TAG
```

The terraform automatically sets `imagePullPolicy: IfNotPresent` for KIND clusters.

### Pods Stuck in Pending

Check for resource constraints:
```bash
kubectl describe pod -n my-test <pod-name>
```

For prover-agent issues, ensure you're using the `dev` resource profile which removes GKE-specific node selectors.

### Stale Contract Addresses

If pods crash with "getGovernance returned no data", the terraform state has stale addresses:

```bash
# Clean ALL terraform state including nested state directories
rm -rf spartan/terraform/deploy-*/state
rm -rf spartan/terraform/deploy-*/.terraform
rm -rf spartan/terraform/deploy-*/terraform.tfstate*

# Delete namespace and redeploy
kubectl delete namespace my-test
./bootstrap.sh network_deploy kind-test
```

### "Committee does not exist on L1"

This is normal during startup. The network needs to progress through the lag period before validators can propose. With `AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=1`, wait ~5-10 minutes.

---

## GCP Deployment

For CI-like testing or when you need more resources.

### GCP Authentication

The test networks run on GKE in the `testnet-440309` GCP project.

**First-time setup:**
```bash
# Install gcloud CLI if needed
# https://cloud.google.com/sdk/docs/install

# Authenticate (opens browser)
gcloud auth login

# Set default project
gcloud config set project testnet-440309

# Get cluster credentials
gcloud container clusters get-credentials aztec-gke-private --region us-west1-a --project testnet-440309
```

**Verify access:**
```bash
kubectl get namespaces | grep -E "scenario|devnet"
```

### Required Tools

```bash
# Install kubectl, helm, terraform if not present
spartan/scripts/install_deps.sh
```

## Deploying a Network

### Method 1: Using ci-network-deploy (Recommended)

This is what CI uses. Spins up an EC2 instance that builds and deploys.

```bash
# From repo root
./ci.sh network-deploy <env-file> <namespace> [docker-image]

# Examples:
./ci.sh network-deploy next-scenario my-test
./ci.sh network-deploy next-scenario my-test aztecprotocol/aztec:0.x.y
```

The `<env-file>` refers to files in `spartan/environments/` (without the `.env` suffix).

### Method 2: Direct Deploy (Faster for iteration)

If you already have a built image or want to use an existing one:

```bash
cd spartan

# Set required env vars
export NAMESPACE="my-test"
export AZTEC_DOCKER_IMAGE="aztecprotocol/aztec:latest"

# Deploy using an environment file
./scripts/network_deploy.sh environments/next-scenario.env
```

### Method 3: Using bootstrap.sh

```bash
# Build image and deploy
NAMESPACE=my-test AZTEC_DOCKER_IMAGE=aztecprotocol/aztec:latest \
  ./spartan/bootstrap.sh network_deploy next-scenario
```

## Environment Files

Environment files in `spartan/environments/` control deployment parameters:

| File | Use Case |
|------|----------|
| `next-scenario.env` | Standard CI test network (4 validators, provers) |
| `devnet.env` | Longer-running devnet |
| `scenario.local.env` | Local kind cluster (no GCP) |

### Key Parameters

```bash
# Cluster and auth
CLUSTER=aztec-gke-private          # GKE cluster name
GCP_REGION=us-west1-a              # GCP region

# Network sizing
VALIDATOR_REPLICAS=4               # Number of validator pods
VALIDATORS_PER_NODE=12             # Attesters per pod
PROVER_REPLICAS=6                  # Prover pods

# Timing (affects bootstrap speed)
AZTEC_EPOCH_DURATION=32            # Slots per epoch
AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=2  # Epochs before committee active

# Lifecycle
DESTROY_NAMESPACE=true             # Clean up on next deploy
CREATE_ETH_DEVNET=true             # Deploy local L1
```

## Faster Bootstrap: Reducing Validator Lag

The `AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET` parameter controls how long validators must wait before they can propose blocks. With default settings:

- `lag=2`, `epoch_duration=32`, `slot_duration=36s`
- Bootstrap time: ~38 minutes before first block

**For faster testing, set lag=0 or lag=1:**

```bash
# In your env file or export directly:
export AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=0  # Immediate block production
export AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=1  # ~19 min bootstrap
```

**Trade-off:** Lower lag reduces security guarantees (committee manipulation possible), but this doesn't matter for testing.

## Running Tests Against a Network

Once deployed, run spartan tests:

```bash
cd yarn-project/end-to-end

# Set namespace
export NAMESPACE=my-test

# Run a specific test
yarn test src/spartan/smoke.test.ts
yarn test src/spartan/upgrade_via_cli.test.ts
```

Or use CI:
```bash
./ci.sh network-tests next-scenario my-test
```

## Monitoring and Debugging

### Check pod status
```bash
kubectl get pods -n my-test
kubectl logs -n my-test my-test-validator-0 --tail=100
```

### Port forward to services
```bash
# RPC node
kubectl port-forward -n my-test svc/my-test-rpc-aztec-node 8080:8080

# L1 execution
kubectl port-forward -n my-test svc/my-test-eth-execution 8545:8545
```

### Check L1 contract state
```bash
# With port-forward running:
ROLLUP=$(cast call --rpc-url http://127.0.0.1:8545 <registry> "getCanonicalRollup()(address)")
cast call --rpc-url http://127.0.0.1:8545 $ROLLUP "getTips()((uint256,uint256))"
```

## Tearing Down

```bash
# Via CI
./ci.sh network-teardown next-scenario my-test

# Or directly
kubectl delete namespace my-test
```

## Common Issues

### "committee does not exist on L1"
Validators waiting for lag period. Either wait for epoch N+lag, or redeploy with lower lag.

### GCP auth errors
Re-run `gcloud auth login` and `gcloud container clusters get-credentials`.

### Pods stuck in Pending
Check node pool capacity: `kubectl describe pod -n <namespace> <pod>`

### Tests fail with stale contract addresses
If a previous upgrade changed the canonical rollup, restart pods or use `registry.getCanonicalAddress()` instead of cached addresses.

## Reference

- **Environment files:** `spartan/environments/*.env`
- **Deploy scripts:** `spartan/scripts/deploy_network.sh`, `network_deploy.sh`
- **GCP auth:** `spartan/scripts/gcp_auth.sh`
- **Terraform:** `spartan/terraform/deploy-aztec-infra/`
- **CI integration:** `ci.sh network-deploy`, `bootstrap.sh ci-network-deploy`
