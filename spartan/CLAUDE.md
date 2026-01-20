# Spartan Deployment Infrastructure

This directory contains the infrastructure-as-code for deploying Aztec networks on Kubernetes.

## Directory Structure

```
spartan/
├── aztec-node/              # Base Helm chart for Aztec nodes
├── aztec-validator/         # Validator chart (wraps aztec-node)
├── aztec-prover-stack/      # Prover infrastructure chart
├── aztec-bot/               # Bot deployments chart
├── aztec-keystore/          # Key derivation setup chart
├── aztec-snapshots/         # Snapshot management chart
├── environments/            # Environment-specific configurations (.env files)
└── terraform/
    ├── deploy-aztec-infra/  # Main deployment module
    └── modules/             # Reusable Terraform modules
        └── web3signer/      # Web3Signer deployment module
```

## Deployment Architecture

### Terraform Structure

The main entry point is `terraform/deploy-aztec-infra/`:

- **main.tf**: Defines all Helm releases using a `helm_releases` map. Each release specifies:
  - `name`: Release name
  - `chart`: Helm chart to use
  - `values`: List of YAML value files from `values/` directory
  - `inline_values`: Dynamic YAML via `yamlencode()`
  - `custom_settings`: Direct Helm `--set` values
  - `boot_node_host_path`/`bootstrap_nodes_path`: P2P discovery config paths

- **variables.tf**: All configuration variables (~670 lines), including:
  - Network configuration (L1 URLs, contract addresses)
  - Component replicas and resource profiles
  - Feature flags and tuning parameters

- **values/**: Helm values files organized by:
  - `common.yaml`: Applied to all releases
  - `{component}.yaml`: Component-specific defaults
  - `{component}-resources-{profile}.yaml`: Resource sizing (prod, dev, etc.)

### Helm Charts

**aztec-node** (base chart):
- Deployable as Deployment or StatefulSet
- Configurable via `node.env` for environment variables
- Pre-start scripts for dynamic configuration
- Services for P2P, RPC, and admin endpoints
- Pod template in `templates/_pod-template.yaml`

**aztec-validator** (extends aztec-node):
- Wrapper chart with `aztec-node` as dependency (aliased as `validator`)
- Adds validator-specific ConfigMap (`env.configmap.yaml`)
- Configures mnemonic, validators-per-node, publisher keys

**aztec-prover-stack**:
- Multi-component: prover node, broker, and agent replicas
- Each component has its own sub-values (`node`, `broker`, `agent`)

### Module Pattern (web3signer example)

Terraform modules at `modules/` encapsulate complex deployments:

```hcl
module "web3signer" {
  count  = tonumber(var.VALIDATOR_REPLICAS) > 0 ? 1 : 0
  source = "../modules/web3signer"

  NAMESPACE     = var.NAMESPACE
  RELEASE_NAME  = var.RELEASE_PREFIX
  # ... other variables

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }
}
```

Modules typically output service URLs for other components to consume.

## Environment Configuration

### Network Defaults (Code Generation)

`environments/network-defaults.yml` is a **code generation source**, not a runtime config file. It centralizes "baked-in" defaults for the yarn-project packages.

**What it defines:**
- `l1-contracts`: L1 smart contract parameters (timing, validator thresholds, slashing)
- `slasher`: Slasher node operational settings (penalties, offense tracking)
- `networks`: Preset configurations for `devnet`, `testnet`, and `mainnet`

**Generated outputs:**
- `yarn-project/ethereum/src/generated/l1-contracts-defaults.ts`
- `yarn-project/slasher/src/generated/slasher-defaults.ts`
- `yarn-project/cli/src/config/generated/networks.ts`
- `l1-contracts/generated/default.json`

**Regenerate after editing:**
```bash
cd yarn-project/ethereum && yarn generate
cd yarn-project/slasher && yarn generate
cd yarn-project/cli && yarn generate
cd l1-contracts && ./bootstrap.sh
```

### Deployment Environment Files

Environment files in `environments/*.env` provide deployment-specific values:

```bash
# Example: devnet.env
NAMESPACE=devnet
RELEASE_PREFIX=devnet
L1_RPC_URLS=https://...
VALIDATOR_REPLICAS=4
PROVER_REPLICAS=1
```

These are loaded by deployment scripts and passed to Terraform.

## Common Patterns

### Passing Environment Variables to Pods

Via Terraform `custom_settings`:
```hcl
"validator.node.env.MY_VAR" = var.MY_VALUE
```

This maps to Helm values that populate the pod's env section.

### Conditional Deployments

Use ternary operators in the `helm_releases` map:
```hcl
validators = tonumber(var.VALIDATOR_REPLICAS) > 0 ? { ... } : null
```

### Values Layering

Values are applied in order (later overrides earlier):
1. `common.yaml`
2. `{component}.yaml`
3. `{component}-resources-{profile}.yaml`
4. `inline_values` (yamlencode blocks)
5. `custom_settings` (highest priority)

### Service Discovery

Internal services use Kubernetes DNS:
```
http://{release-name}-{component}.{namespace}.svc.cluster.local:{port}
```

Example web3signer URL:
```
http://staging-signer-web3signer.staging.svc.cluster.local:9000/
```

## Key Components

### Validators
- Run sequencer/proposer logic
- Use web3signer for remote key management
- Support HA with shared attester identity + unique publisher keys
- Coordinate via shared PostgreSQL for HA signing

### Provers
- Generate validity proofs for epochs
- Broker distributes proving jobs to agents
- Agents can scale horizontally

### RPC Nodes
- Serve public API endpoints
- Optional ingress with GCP backend config
- Archive nodes for historical data

### Boot Nodes
- P2P bootstrap for network discovery
- Internal boot node optional (can use external)

## Adding New Infrastructure

1. **Simple addition**: Add to `helm_releases` map in main.tf
2. **Complex component**: Create new module in `modules/`
3. **New Helm chart**: Add to `spartan/` root (follow aztec-keystore pattern)

For new modules, follow the web3signer pattern:
- `main.tf`: Helm release(s) and supporting resources
- `variables.tf`: Input variables
- `outputs.tf`: Service URLs and other outputs
- `values/`: Base Helm values if needed
