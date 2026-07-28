---
name: create-rpc-api-key
description: Manage public RPC API key consumers for an Aztec RPC environment (mainnet or testnet) — add a new consumer end-to-end (mint the GCP Secret Manager secret, wire it into Kong via Terraform, apply, verify, open the PR), list existing consumers and their real owners, and check or change a consumer's per-minute rate limit. Use when asked to add/create an RPC API key, onboard a new RPC client/consumer, "give <someone> a mainnet/testnet rpc key", or to list/inspect/raise/lower an RPC consumer's rate limit.
---

# Manage public RPC API keys

This runbook covers the full lifecycle of a public RPC gateway consumer: **creating** a key (Steps 1–6), **listing** who has keys, and **checking / changing** a consumer's rate limit.

A key is a value stored in GCP Secret Manager; Terraform turns it into a Kong consumer that can call every keyed route in the environment. Externally the consumer is just `clientN`; the real recipient is recorded only as a private `client_name` annotation on the secret.

The two RPC environments live in `spartan/terraform/deploy-rpc/environments/`:

| Environment | dir | secret prefix | namespace / release prefix |
|---|---|---|---|
| mainnet | `environments/mainnet` | `mainnet-rpc-consumer` | `mainnet-rpc` / `mainnet` |
| testnet | `environments/testnet` | `testnet-rpc-consumer` | `testnet-rpc` / `testnet` |

The examples below use **mainnet**. For testnet, swap the dir, prefix, namespace, and context. Always read the target env's existing consumer entries and copy their exact prefix rather than assuming.

## Two consumer-config shapes (mainnet vs testnet differ)

The `CONSUMERS` map passed to the environment module is written differently in each env — read the target env's `main.tf` before editing:

- **mainnet** — an **explicit map**, one `clientN` block per consumer, each with its own `rate_limit_minute`. This is where you set an individual mainnet consumer's limit.
- **testnet** — **generated** from a `consumer_secret_names` list via a `for` comprehension that hardcodes `rate_limit_minute = 0` for every entry. So every testnet key is unlimited by construction, and there is no per-consumer limit knob unless you break a consumer out of the loop into its own explicit entry.

**Rate-limit tiers.** `rate_limit_minute = 0` means **unlimited** (no rate-limit plugin is generated; see the `consumers_with_rate_limit` filter in `spartan/terraform/modules/rpc-gateway/main.tf`). A positive value generates a `rate-limiting` KongPlugin with `policy = "local"` and `limit_by = "consumer"` — **`local` means the limit is enforced per Kong pod**, so the effective ceiling is `rate_limit_minute × (number of Kong gateway pods)`. When `ALLOW_ANONYMOUS = true` (testnet), keyless callers fall back to an anonymous consumer capped at `ANONYMOUS_RATE_LIMIT_MINUTE` (default 300) **per IP, per pod**; mainnet sets `ALLOW_ANONYMOUS = false` so a key is mandatory there.

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

**testnet variant.** testnet does not use an explicit map — it builds `CONSUMERS` from a `consumer_secret_names` list. Add the new secret name to that list instead:

```hcl
  consumer_secret_names = [
    "testnet-rpc-consumer-client1",
    "testnet-rpc-consumer-client2", # new
  ]
```

Every entry inherits `rate_limit_minute = 0` (unlimited) from the comprehension. To give one testnet consumer a finite cap, it cannot stay in the uniform loop — break it out into its own explicit `CONSUMERS` entry (or merge an override) with the desired `rate_limit_minute`.

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

## Listing consumers and their owners

The `clientN` → real-recipient mapping lives **only** in the `client_name` annotation on each GCP secret — it is never in the committed Terraform or in the cluster. To find who owns which key, list the secrets with their annotation:

```bash
# one env
gcloud secrets list --filter="name:mainnet-rpc-consumer" \
  --format="table(name.basename(), createTime, annotations.client_name)"

# every RPC consumer across all envs (mainnet, testnet, staging, testnet-prover, eth-sepolia, …)
gcloud secrets list --filter="name~rpc-consumer" \
  --format="value(name.basename(), annotations.client_name)" | sort
```

To find a specific person's key, grep the annotation column — the owner may not have a key at all (in which case, on testnet, they are just using the anonymous tier and "bumping" them means creating a key):

```bash
gcloud secrets list --filter="name~rpc-consumer" --format="value(name.basename(), annotations.client_name)" | grep -i <name>
```

Cross-check against what is actually live in the cluster (the committed `main.tf` can lag behind live — always reconcile against `origin/merge-train/spartan`, not a possibly-stale checkout):

```bash
CTX=gke_testnet-440309_us-west1-a_aztec-gke-public
kubectl --context "$CTX" -n <ns>-rpc get kongconsumer
```

## Checking a consumer's rate limit

The declared limit is the consumer's `rate_limit_minute` in the env `main.tf` (`0` = unlimited). To read the **effective live** limit instead of the declared one:

```bash
CTX=gke_testnet-440309_us-west1-a_aztec-gke-public
NS=testnet-rpc

# does the consumer carry a rate-limit plugin annotation? (absent ⇒ unlimited)
kubectl --context "$CTX" -n "$NS" get kongconsumer <release-prefix>-<key> -o jsonpath='{.metadata.annotations}'; echo

# the per-consumer rate-limit plugin config, if any
kubectl --context "$CTX" -n "$NS" get kongplugin <release-prefix>-<key>-rpc-rate-limit -o jsonpath='{.config}'; echo

# the anonymous (keyless) limit, per route — testnet only
kubectl --context "$CTX" -n "$NS" get kongplugin <release-prefix>-<route>-anonymous-rpc-rate-limit -o jsonpath='{.config}'; echo

# Kong pod count — the local policy multiplies the limit by this
kubectl --context "$CTX" -n "$NS" get pods | grep kong-gateway
```

Remember `policy = "local"`: the real ceiling is `minute × (Kong gateway pod count)`. With a single gateway pod, the number in the plugin is the number the client sees.

## Changing a consumer's rate limit

Editing `rate_limit_minute` for an existing consumer, then `plan`/`apply` exactly as in Steps 3–4. **The Step 3 guardrail still applies**: the plan must touch only that one consumer's rate-limit plugin and its `KongConsumer` annotation — nothing else. Expected plan deltas by transition:

| Change | Expected plan |
|---|---|
| `0` → `N` (add a cap) | `1 to add, 1 to change` — creates the rate-limit `KongPlugin`, annotates the consumer to use it |
| `N` → `M` (both > 0) | `1 to change` — just the plugin's `minute` |
| `N` → `0` (remove the cap) | `1 to change, 1 to destroy` — drops the plugin, removes the consumer annotation |

Notes:

- **testnet caveat**: a testnet consumer generated by the `consumer_secret_names` loop is uniformly `rate_limit_minute = 0`. You cannot raise *one* testnet consumer above/below the others without pulling it out of the loop into an explicit `CONSUMERS` entry (see the testnet variant under Step 2). If the intent is simply "more than the 300/min anonymous tier", giving them a key already makes them unlimited — no per-consumer plugin needed.
- **Raising the anonymous tier** (testnet, keyless users) is a different lever: set `ANONYMOUS_RATE_LIMIT_MINUTE` on the testnet env module (default 300). This affects **every** keyless caller, not one person.
- Commit message convention for a limit change is a normal `chore:`/`fix:` describing the change (not `chore: add new client`), on base `merge-train/spartan`. Do not name the private owner in the PR.
