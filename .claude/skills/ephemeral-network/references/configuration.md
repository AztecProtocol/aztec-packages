# Configuration and image

## Access and context

Resolve the intended cluster from the chosen environment and compare it with the live configuration. `kubectx` and `kubens` use the same kubeconfig as `kubectl`; installed binaries alone do not establish access.

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
kubectl config current-context
kubectx -c
kubens -c
kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
```

Use `gcloud container clusters get-credentials` with explicit project and `--zone` or `--region` matching the cluster. Spartan calls the variable `GCP_REGION` even for zonal locations. Check both a live `kubectl --request-timeout=15s get namespaces` and the necessary namespace permissions with `kubectl auth can-i`. Verify GCS Terraform-state access and Secret Manager metadata access separately. Terraform uses Application Default Credentials; successful `gcloud auth login` does not establish ADC. Use `gcloud auth application-default login` when needed. Test token acquisition with output suppressed, never print tokens.

An expired gcloud login can leave a correct-looking kubeconfig that cannot refresh credentials. Report that as an access blocker, not network downtime. Credential refresh can also reset the active namespace to `default`; verify/reselect it after the last wrapper that calls `gcp_auth`.

## Environment

Start from `spartan/environments/next-net.env` or the closest requested topology. Read `scripts/source_env_basic.sh`, `source_network_env.sh`, `deploy_network.sh`, and the Terraform modules to resolve precedence/defaults. Pass the environment basename without `.env` to the bootstrap commands.

Set or review these values explicitly:

| Setting | Purpose |
| --- | --- |
| `GCP_PROJECT_ID`, `GCP_REGION`, `CLUSTER` | Existing GKE destination |
| `NAMESPACE` | Unique name; also isolates release names and Terraform state |
| `NETWORK` | Runtime preset, not namespace; retaining `next-net` can be appropriate |
| `DESTROY_NAMESPACE=false` | Preserve PVCs during ordinary redeploys; next-net's template enables destruction |
| `CREATE_ROLLUP_CONTRACTS=${CREATE_ROLLUP_CONTRACTS:-false}` | Require an explicit first-deploy override |
| `LABS_INFRA_MNEMONIC_SECRET_NAME` | Dedicated mnemonic, even when reusing the runtime preset |
| `BLOB_BUCKET_DIRECTORY`, snapshot directory/URL | Unique object prefixes; no old-chain snapshots on fresh genesis |
| `PROVER_FAILED_PROOF_STORE`, `L1_TX_FAILED_STORE` | Unique diagnostic prefixes |
| `RPC_GATEWAY_ENABLED` and gateway hosts | Disable unless ingress is wanted; never reuse next-net's hostname |
| `CREATE_ETH_DEVNET=false`, `ETHEREUM_CHAIN_ID=11155111` | Sepolia rather than a new local L1 |
| `DEPLOY_INTERNAL_BOOTNODE=true`, private P2P settings | Isolated discovery within the cluster |
| `REAL_VERIFIER=true` | Real proofs when validating proving health |

The GCS backend currently uses bucket `aztec-terraform`, with module prefixes rooted at `${CLUSTER}/${NAMESPACE}`. Confirm that in `scripts/override_terraform_backend.sh`; an environment filename alone does not isolate state. Check the intended namespace and state prefix for existing resources before calling a network new. Do not rename or reuse an existing network's state to get past collisions.

Review the complete topology: validators, validators per pod, HA replicas and any separate HA pod count, publishers per replica, prover-node/agent capacity, KEDA limits, bots, resource profiles, and persistent storage. Ensure the registered validator count can fill the target committee. HA pods share attesters but need distinct publisher keys. KEDA agents at zero before proving work can be healthy.

Preserve consensus timings unless the experiment requires changing them. If a named runtime preset rejects an intentional override, understand `ALLOW_OVERRIDING_NETWORK_CONFIG` before setting it. Incompatible protocol changes generally need a fresh network, not an image swap against old contracts/data.

Fast Inbox experiments also require a source revision containing the Inbox bot and its complete env-to-Terraform-to-chart wiring. Verify `BOT_INBOX_REPLICAS`, mnemonic start index, interval, messages per batch, consume mode, seed/outstanding cap, and L1-to-L2 timeout in that revision. Do not add unsupported variables to an older template and assume they take effect.

Run `bash -n` on changed shell/env inputs, `./bootstrap.sh build` from Spartan, and `scripts/check_env_vars.sh` as appropriate. The build includes Helm lint and Terraform formatting checks; inspect failures rather than silently treating them as irrelevant. Render/check the intended chart values when adding wiring. Do not bulk-format unrelated Terraform to make a new environment pass.

## Build and publish

Use the requested stack tip in a standalone aztec-node checkout. Commit the deployment configuration before building so its image identity is reproducible. Follow that revision's root Makefile/bootstrap dependency chain; TypeScript-only `yarn build` does not regenerate artifacts. Local builds and a remote build machine are both valid, provided the same source commit and pinned toolchain are used.

The repository `release-image/bootstrap.sh` wrapper builds `azteclabs/aztec:<source-sha>` and updates local `latest`. It may force-remove older local image IDs after a fresh build; disclose this effect and honor the user's existing preference. A manually constructed Docker command must preserve the wrapper's dependency/base-image/toolchain setup if older IDs need preserving.

Artifact Registry is optional. Publish under an authorized Docker Hub account using normal Docker login; do not copy credentials into env files or the image. After running the release wrapper from `release-image/`, an example retag is:

```bash
network_image_sha=$(git rev-parse HEAD)
network_image_repo='docker.io/example-user/aztec'
docker tag "azteclabs/aztec:$network_image_sha" "$network_image_repo:$network_image_sha"
docker push "$network_image_repo:$network_image_sha"
docker buildx imagetools inspect "$network_image_repo:$network_image_sha"
```

Replace the example owner with the requested account. Record the registry digest and verify the cluster's CPU architecture is available; an ARM laptop image alone will not run on amd64 GKE nodes. Public images need no registry pull secret. For private images, confirm the chart supports and is configured with the required namespace-scoped pull secret.

Set `AZTEC_DOCKER_IMAGE` to the published immutable tag/digest. Check `PROVER_AGENT_DOCKER_IMAGE` as well: by default agents use the node image, whereas a dedicated agent image can bundle CRS. Do not invoke a public release workflow merely to publish an ad-hoc image.
