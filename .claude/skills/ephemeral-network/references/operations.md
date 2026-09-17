# Deployment and operations

## First deployment and redeployment

From the selected checkout's `spartan/`, after configuration/image/funding checks:

```bash
CREATE_ROLLUP_CONTRACTS=true \
  AZTEC_DOCKER_IMAGE="$network_image" \
  ./bootstrap.sh network_deploy "$network_environment"
```

This command applies Terraform and deploys L1 contracts and Kubernetes workloads; it is not a plan-only preview. `deploy_network.sh` writes backend overrides and tfvars for each module and may auto-approve destroy/apply steps. Ensure the requested scope is approved before running it. In aztec-packages, invoke through `scripts/labs_env.sh` as described in the skill entrypoint.

Use `CREATE_ROLLUP_CONTRACTS=true` only for the authorized first deployment or deliberate reset. The script destroys the prior contract-deployment Terraform resources before replacing them; already deployed L1 contracts cannot be erased. For normal image updates use explicit `CREATE_ROLLUP_CONTRACTS=false` and `DESTROY_NAMESPACE=false`, preserving the namespace, state and PVCs. Beware: if no registry output exists, the wrapper can still deploy contracts with the flag false. Check the exact backend and existing public registry output before treating an invocation as an existing-chain redeploy.

The wrapper may suppress routine logs while work continues. Track the process and namespace, pending pods, events, rollout status, and specific completed jobs rather than launching a second deployment. A lost terminal/process result is not evidence nothing deployed; inspect state/resources before retrying. Do not clear state locks unless the associated operation is confirmed dead and the exact lock is in scope.

Record the public registry, rollup, Inbox and fee-asset-handler addresses, chain ID, genesis, image digest, and deployment result. Confirm those addresses agree across RPC nodes and the expected L1 code/configuration. Use `aztec_getL1ContractAddresses` or specific public Terraform outputs, not a full state/secret dump.

## Activation and health gates

Expected first committee timing is approximately:

```text
(max(validator-set lag, RANDAO lag) + 1) × slots per epoch × seconds per slot
```

For 72-second slots, 32 slots/epoch, and lag 2, this is 6912 seconds (115.2 minutes) from genesis. Read the actual on-chain configuration and `scripts/wait_for_l2_block.sh`; its timeout includes a buffer. Pre-activation `NoCommitteeError` is expected only within that window. Use:

```bash
./bootstrap.sh wait_for_l2_block "$network_environment"
kubens "$network_namespace"
```

Credential refresh in the waiter can reset the namespace, hence the final `kubens` check. Verify `kubectl config current-context`, `kubectx -c`, and `kubens -c` again. Use explicit namespace/context for subsequent diagnostics.

Observe at least two advancing RPC heights after activation, then validate:

- Validators, RPC, bootstrap, signer/HA database, prover node and broker are Ready, synchronized, and peered; restart counts are stable.
- Bots finish setup and their submitted transaction hashes acquire canonical L2 receipts. Readiness alone does not demonstrate inclusion.
- KEDA scales agents when jobs arrive, checkpoint subproofs complete, an epoch closes, and an epoch proof is submitted **and accepted on L1**. A subproof or completed proving job is not an accepted epoch proof. Track proven versus pending progress against the configured proof-submission deadline.
- Slot coverage is derived from actual slot/checkpoint data, not block-height differences: multiple blocks can share a slot. Exclude pre-activation and the current incomplete slot; report the missed-slot numerator/denominator and time window.
- Reorg/prune events are reconciled across archiver, sequencer, canonical L1 receipts, and affected L2 transaction receipts. Distinguish real events from configuration, handler registration, and ordinary shutdown messages.

Check slashing/offenses, attestation timeouts, unexplained conflicts/prunes, and repeat failures. The `network-spot-check` and `network-logs` skills in the deployment checkout provide the detailed log workflow when available. Do not invoke mutation-heavy scenario suites (slashing, chaos, reorg, upgrades) merely to health-check a running network.

Known startup issues to investigate rather than normalize:

- Bot init can have a fixed 4200-second wait followed by a 20-minute startup probe while protocol activation takes ~115 minutes. Restart loops can repeat setup, collide with pending transactions, and create duplicate-nullifier failures. Compare chart deadlines to activation and inspect whether health means setup completed.
- Prover libp2p `ERR_NO_VALID_ADDRESSES` can recover during address/CNI readiness; confirm peers and stable restarts, and diagnose persistence rather than repeatedly deleting the pod.
- HA database migrations can race database readiness; verify completion after `pg_isready` rather than inferring failure from one `ECONNREFUSED`.

## Safe logs and Inbox latency

Use structured Cloud Logging records with `resource.type="k8s_container"`, explicit project/cluster/namespace, and bounded UTC start/end timestamps. Select known message families and allowlisted fields. Do not dump whole `textPayload`, config messages, or arbitrary `jsonPayload`: even a structured message string can contain an interpolated mnemonic. Filter in the query before displaying results. Count results and paginate/split windows if limits are reached; a capped query is not a complete sweep.

For Fast Inbox, correlate by batch/message ID and transaction hash. Inspect the deployed bot's log/metric implementation to identify the actual timestamps and units. Measure distinct stages from the same start point where available:

1. L1 submission to successful L1 receipt.
2. Submission/receipt to node observation and message readiness.
3. Submission/receipt to canonical L2 consumption receipt, separated by public/private consume mode.

Report counts, failures/timeouts/retries, outstanding message age, and p50/p95/max for each measurable stage. Name whether the start is submission time or L1 block time; polling and block timestamps have different precision. Batch cadence and the configured timeout are not observed latency. Preserve incomplete/censored messages in the report instead of counting only fast successes. If no correlated timestamps exist, report the gap rather than inventing precision.

Include bot production-loop, consumption-loop, setup and replay-probe errors. Match an error to later recovery by the same message/transaction, and verify re-mining after reorg when applicable. Expected replay rejection is not equivalent to failed first consumption. Compare bot receipts to canonical node/L1 state before declaring success.

Append new findings and evidence to the deployment record. Report separately what is healthy, what recovered, what remains broken, and which checks were blocked by credentials or unavailable history.

## Retirement

Only tear down when requested or covered by an explicit previously agreed expiry. Present the exact context, namespace, Terraform prefixes, PVC/PV effects, and object-store prefixes before any destructive step; do not treat a deployment approval as a deletion approval.

Inspect `scripts/network_teardown.sh` in the selected revision. It deletes namespace-scoped Chaos resources (including finalizer handling) and the namespace. It does **not** clean GCS Terraform state, cloud object stores, Docker tags, mnemonic secrets, or L1 contracts. Verify PVC reclaim policies before deletion. Run it only with the validated namespace and selected context after authorization; do not use `DESTROY_NAMESPACE=true` in a deploy command as a convenient standalone teardown, because that command proceeds to redeploy.

Decide separately which Terraform records, snapshots/blobs, failed-proof artifacts, registry images, and secret versions must be retained or removed. Keep state until its managed resources are accounted for; never recursively delete a shared bucket/prefix. L1 contracts remain deployed and leftover Sepolia funds remain on their addresses; refunds require their own authorized transaction amounts/destinations. Verify namespace/workload removal and report residual resources plus the recovery implications of deleted PVCs.
