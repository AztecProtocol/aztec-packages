---
name: create-rpc-api-key
description: Add a new public RPC API key consumer to an Aztec RPC environment (mainnet or testnet) — mint the GCP Secret Manager secret with the helper script, wire it into Kong via Terraform, apply, verify it is live, and open the PR. Use when asked to add/create an RPC API key, onboard a new RPC client/consumer, or "give <someone> a mainnet/testnet rpc key".
---

# Create a public RPC API key

Adds one API key for the public RPC gateway. A key is a value stored in GCP Secret Manager; Terraform turns it into a Kong consumer that can call every keyed route in the environment. Externally the consumer is just `clientN`; the real recipient is recorded only as a private annotation on the secret.

The two RPC environments live in `spartan/terraform/deploy-rpc/environments/`:

| Environment | dir | secret prefix | namespace / release prefix |
|---|---|---|---|
| mainnet | `environments/mainnet` | `mainnet-rpc-consumer` | `mainnet-rpc` / `mainnet` |
| testnet | `environments/testnet` | (check that env's `CONSUMERS` entries) | `testnet-rpc` / `testnet` |

The examples below use **mainnet**. For testnet, swap the dir, prefix, namespace, and context. Always read the target env's existing `CONSUMERS` entries and copy their exact prefix rather than assuming.

## Before you start — access and tooling

- **Working directory**: agents in this repo often run with `yarn-project` as the shell CWD, but the script and Terraform live under the git root's `spartan/`. Use absolute paths (or the correct git-root-relative path). Do **not** `cd` — the Bash working directory persists across calls and a stray `cd` will break later relative paths.
- **gcloud**: authenticated, project `testnet-440309` (`gcloud config get-value project`). Terraform's GCS backend and google provider need Application Default Credentials — if you hit auth errors, `gcloud auth application-default login`.
- **kubectl**: the GKE context `gke_testnet-440309_us-west1-a_aztec-gke-public` must exist (`kubectl config get-contexts`).
- **Terraform version**: the remote state may have been written by a newer Terraform than your local binary, and Terraform refuses to operate on newer state. Check and match:
  ```bash
  # state version (mainnet)
  gcloud storage cat gs://aztec-terraform/aztec-gke-public/mainnet-rpc/deploy-rpc/terraform.tfstate/default.tfstate | jq -r .terraform_version
  terraform version
  ```
  If local `< state`, install a matching-or-newer Terraform before continuing.

## Step 1 — mint the secret

`spartan/scripts/create_api_key.sh <prefix> <internal-owner-name>`

- `<prefix>` = the environment's consumer prefix, e.g. `mainnet-rpc-consumer`.
- `<internal-owner-name>` = a private annotation naming the real recipient (e.g. `vitalik`, `fairies`). Kept for our records only — **do not put it in the public PR.** Match the lowercase style of existing annotations.
- The script lists existing `<prefix>-client*` secrets, takes the most recently created, and creates the next index (`clientN+1`). If none exist it starts at `client1`.

```bash
/abs/path/to/spartan/scripts/create_api_key.sh mainnet-rpc-consumer fairies
# -> Created version [1] of the secret [mainnet-rpc-consumer-client9].
```

Verify (note the index and annotation):
```bash
gcloud secrets describe mainnet-rpc-consumer-client9 --format="value(name.basename(), annotations)"
```

Caveat: the "next index" is derived from the most-recently-*created* secret, not the max number. This is only a problem if secrets were created out of order — normally fine.

## Step 2 — add the consumer to Terraform

Edit `spartan/terraform/deploy-rpc/environments/<env>/main.tf` and append a `clientN` entry to the `CONSUMERS` map, matching the existing entries exactly:

```hcl
    client9 = {
      username                       = "mainnet-rpc-consumer-client9"
      gcp_secret_manager_secret_name = "mainnet-rpc-consumer-client9"
      rate_limit_minute              = 0
    }
```

`rate_limit_minute = 0` means unlimited (no rate-limit plugin is generated). Use a positive value only if a cap is intended.

## Step 3 — plan and verify (the guardrail)

```bash
TF=/abs/path/to/spartan/terraform/deploy-rpc/environments/mainnet
terraform -chdir="$TF" init -reconfigure -input=false
terraform -chdir="$TF" plan -input=false -out=tfplan
```

The plan **must** be exactly:

```
Plan: 2 to add, 0 to change, 0 to destroy.
```

The two additions are the new consumer's resources:
- `module.environment.module.rpc_gateway.kubernetes_manifest.consumer["clientN"]` — the KongConsumer
- `module.environment.module.rpc_gateway.kubernetes_manifest.consumer_key_external_secret["clientN"]` — the ExternalSecret that pulls the key from Secret Manager into Kong

If the plan shows **anything else** — a change/replace/destroy on an RPC node, helm release, domain, or another consumer — STOP and find out why. Common cause: a deployment change (e.g. a version promotion) has been merged to the branch but not yet applied to live, so applying now would also push that change. You do **not** need to pass image `-var`s if the env's image defaults match the live pods (`kubectl -n <ns> get pods -o jsonpath=... <node>`). If you must add a key without triggering such a pending deployment, temporarily revert that change in your working tree so the plan is clean — but do not commit the revert (see Step 6).

## Step 4 — apply

```bash
terraform -chdir="$TF" apply -input=false tfplan
```

The ExternalSecret has a `wait { Ready }` block, so the GCP secret from Step 1 must already exist or the apply will block waiting for it to sync.

## Step 5 — verify it is live

```bash
CTX=gke_testnet-440309_us-west1-a_aztec-gke-public
kubectl --context "$CTX" -n mainnet-rpc get kongconsumer mainnet-client9          # PROGRAMMED=True
kubectl --context "$CTX" -n mainnet-rpc get externalsecret mainnet-client9-rpc-key-auth  # Ready/SecretSynced=True
```

(Resource names are `<release-prefix>-clientN` and `<release-prefix>-clientN-rpc-key-auth`.)

## Step 6 — open the PR

The committed Terraform is a record of what is already applied. Keep the PR to a single-purpose, one-line addition.

- **Commit only the `clientN` addition.** If you made a temporary revert in Step 3 to get a clean plan, undo it so it is not committed — the diff must be the `clientN` block and nothing else. Verify with `git diff <base>...HEAD -- <main.tf path>`.
- Commit message: `chore: add new client` (the established convention). Author is the git author — no Claude attribution.
- **Base branch: `merge-train/spartan`** for these `spartan/` deploy changes (not `next`). Branch off it, and if the base has moved, rebase the single commit onto it so the PR diff stays client-only.

```bash
git checkout -b stack/chore-add-new-client-N origin/merge-train/spartan
# edit main.tf to add clientN
git add /abs/path/.../environments/mainnet/main.tf
git commit -m "chore: add new client"
git push -u origin stack/chore-add-new-client-N
gh pr create --base merge-train/spartan --head stack/chore-add-new-client-N \
  --title "chore: add new client" \
  --body "Adds \`clientN\` to the mainnet RPC consumers. Secret created and already \`terraform apply\`-ed; the plan was the two expected resources (KongConsumer + ExternalSecret). Rate limit 0 = unlimited."
```

**Print the PR URL back to the user.** Do not name the private owner in the PR title or body.

If the previous client-add PR merged while you were working (and its branch was deleted), target `merge-train/spartan` directly and rebase your commit onto it so the diff is only the new client.

## Handing the key to the recipient

The key value was never printed (the script piped it straight into Secret Manager). Retrieve it with:

```bash
gcloud secrets versions access latest --secret=mainnet-rpc-consumer-client9
```

It is a bearer credential — share it over a secure channel, not plain chat/email. The recipient uses it either way:

- Path form: `https://canonical.mainnet.rpc.aztec-labs.com/<KEY>`
- Header form: `x-aztec-api-key: <KEY>` against `https://canonical.mainnet.rpc.aztec-labs.com/`

The consumer is defined at the environment level, so the key authenticates on **every** keyed route in that environment (e.g. mainnet `v4`, `canonical`, and `v5` hosts) — one key, all routes.
