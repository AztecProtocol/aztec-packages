# Secrets and funding

## Check secret handling first

Inspect the selected deployment revision before loading secrets. Known failure modes include:

- `scripts/setup_gcp_secrets.sh` emitting `::add-mask::<value>` outside GitHub Actions. Those lines are raw secrets in a local terminal; masking output must be conditional on `GITHUB_ACTIONS=true`.
- `aztec-node/scripts/setup-otel-resource.sh` enabling shell xtrace when sourced, then `get-private-key.sh` tracing mnemonic arguments and derived keys. Disable/preserve tracing across the whole credential-handling path, not just one command.
- `yarn-project/aztec/src/cli/cmds/start_bot.ts` interpolating the full bot configuration into a string. Logger field redaction cannot sanitize a mnemonic already embedded in a message string.
- Deployment enrichers automatically collecting startup logs on failure. Fix the producing code or ensure the collection is sanitized before running with real credentials.

If present, prepare and verify the narrow fixes before deployment. Do not set `GITHUB_ACTIONS=true` locally to pretend masking works. Do not use `bash -x`, print full environment/configuration, dump Kubernetes Secrets, or attach raw startup logs/Terraform plans. Restrict local tfvars/state/plan permissions; they contain credentials even if console output is quiet.

For an already deployed leak, record the exposure without copying values. Treat every derived identity as exposed to log readers. Fix logging before replacing credentials. A new Secret Manager version does not safely rotate attesters, signer keystores, funded publishers, and on-chain registrations by itself; obtain authorization for the concrete rotation or fresh-network reset.

## Where the mnemonic lives

For local Spartan deployment, the mnemonic belongs in **Google Cloud Console → Secret Manager → the environment's `GCP_PROJECT_ID` → a dedicated secret → a version**. It is not a GitHub repository, environment, organization, Dependabot, or Codespaces secret.

The environment contains only references:

```bash
L1_NETWORK=sepolia
LABS_INFRA_MNEMONIC_SECRET_NAME=sepolia-labs-example-network-mnemonic
LABS_INFRA_MNEMONIC=REPLACE_WITH_GCP_SECRET
```

`setup_gcp_secrets.sh` reads the custom name when provided. Otherwise it derives `${L1_NETWORK}-labs-${NETWORK}-mnemonic`; reusing `NETWORK=next-net` without a custom name therefore reuses next-net's identity. The current loader reads `latest`, so record the resolved version and avoid changing it during a deployment.

Generate a fresh cryptographically random mnemonic using the installed wallet tooling's verified syntax, with tracing disabled. Pipe it directly to `gcloud secrets create ... --data-file=-`, or use a protected temporary file (`umask 077`, a `mktemp` directory) if a pipe is not supported. Never put the mnemonic in an inline command, chat, repository, or tool output. Check the exact command's output shape first using a disposable test; some wallet commands emit extra JSON or addresses. If creating the secret fails, do not blindly add a version to a pre-existing name: inspect metadata and confirm ownership first.

Grant only the actual deployment identity access. Existing shared RPC/deployer/funder secrets may already be available; read their mapping in `setup_gcp_secrets.sh` rather than inventing GitHub secrets. The deployer key is separate from the network mnemonic when `ROLLUP_DEPLOYMENT_PRIVATE_KEY` is configured. Verify all references resolve by reporting success/name/version, never value.

## Derive and audit accounts

Run `scripts/calculate_publisher_indices.sh <environment>` from Spartan, then compare its output with the **same revision's** `terraform/deploy-aztec-infra/main.tf` and key-setup scripts. Older helpers fund only `PUBLISHERS_PER_PROVER` keys and omit Inbox bots; do not trust a successful exit as complete coverage.

For equal primary/HA pod counts, validator publishers require:

```text
VALIDATOR_REPLICAS × VALIDATOR_PUBLISHERS_PER_REPLICA × (1 + VALIDATOR_HA_REPLICAS)
```

If HA pod counts differ, derive ranges from Terraform's actual per-release offsets. Attester count is not publisher count. Prover publisher coverage must mirror the maximum prover replica capacity used by Terraform, including `PROVER_AGENT_KEDA_MAX_REPLICAS` when KEDA is enabled and zero when proving is disabled. Check non-KEDA defaults against the actual code too. Include every enabled transfers/swaps/cross-chain/Inbox bot replica and its configured start index. Verify all ranges are disjoint.

A useful arithmetic example: two primary pods, one equally sized HA release, four publishers per pod, capacity four with two prover publishers each, and three single-replica bots need `16 + 8 + 3 = 27` funded identities. This is an example, not a universal topology or funding budget.

Derive public addresses with the same mnemonic derivation path/index as deployment. Report index/address/balance only. Audit the separate rollup deployer and the funding source too. Attesters do not automatically need ETH merely because their keys are registered.

For workstation L1 reads, use the `l1-rpc-cast` skill when available. Its local endpoint file is sourced in the same shell invocation as `cast`. Otherwise use the authorized RPC configuration without printing the URL. Verify Sepolia chain ID `11155111` before relying on balances or sending funds. GCP deployment RPC lists can start with private `10.x` endpoints reachable from GKE but not the laptop; use `EXTERNAL_ETHEREUM_HOST` for the funding helper instead of changing the pods' endpoints. Switch away from throttled/disabled providers; HTTP 200 alone does not prove JSON-RPC success, and batch responses must contain the expected IDs/results.

## Fund only the reviewed deficit

Prepare a read-only proposal with chain, funding source, recipient addresses/indices, current balances, low/high watermarks, exact per-recipient deficit, deployer top-up, total value, and gas headroom. Choose amounts for the run's duration/load; a previous long experiment's 10 SepETH/account is not a default. If the user will supply funds, give the public funding address, chain, and total, then wait for a confirmed receipt/balance. Never request their private key in chat.

`scripts/ensure_funded_environment.sh` and `scripts/ensure_eth_balances.sh` **send transactions**; neither is a dry-run balance checker. Inspect their current behavior and use them only after the funding amounts/destination are authorized. A funding proposal not already covered by the user's approval needs explicit approval before broadcast.

After securely loading the environment and selecting a reachable RPC in a no-xtrace shell, the existing helper is:

```bash
./scripts/ensure_funded_environment.sh "$network_environment" "$FUNDING_PRIVATE_KEY" "$network_low_watermark" "$network_high_watermark"
```

Keep private-key expansion out of captured command traces. The helper sources the environment itself; account for that when setting overrides. It checks publisher/bot balances and separately the deployer; its lower-level helper can fund many recipients with Multicall3. Do not duplicate funding logic in a new tool. If the current index helper is incomplete, correct/test it before using the funding wrapper. Verify receipts, transferred amounts, and resulting balances; record public transaction hashes. On an ambiguous send failure, inspect nonce/receipt before retrying to avoid duplicate transfers.
