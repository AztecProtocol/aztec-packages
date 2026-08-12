---
name: network-deployed-version
description: Determine which git commit an Aztec network (next-net, devnet, staging) is running now or was running at a past time T, and whether a specific fix or PR is live on it. Use for incident triage ("was the fix deployed when X happened?"), confirming a fix reached a network, or identifying the exact deployed commit.
---

# Determine an Aztec network's deployed commit

Aztec networks deploy via **scheduled GitHub Actions workflows**. Depending on the network, the run history lives in **either** the PRIVATE repo `AztecProtocol/aztec-packages-private` **or** the PUBLIC repo `aztec-labs-eng/aztec-node` — see the table below for which repo each network deploys from (`gh` needs auth with access to both). The commit a network runs at time T is the **headSha of the last *successful* deploy run at or before T** — failed runs leave the previous commit live, so a string of failed nightlies can keep a network on a days-old commit.

> The local working clone is usually the **public mirror** (`aztec-packages`), which has *different commits and PR numbers*. Do not infer deployed code from local `origin/next`.

## Run the investigation in a subagent

Do **not** run the `gh`/`gcloud` commands below in the main conversation — they flood context with run lists and raw file dumps for what is ultimately a one-line answer. Instead, **spawn a `general-purpose` subagent**, hand it the query parameters, and point it at this file. Relay only its condensed answer to the user.

Subagent prompt template (fill in the bracketed parts):

> Determine [which commit `next-net` was running at 2026-06-20 14:00 UTC / whether the fix from public PR #23940 is live on `devnet` now / which commit `staging` is running now]. The working directory is `yarn-project`. Read the file `.claude/skills/network-deployed-version/SKILL.md` and follow its "Procedure" steps exactly, using the "Network → deploy workflow" table to pick the right repo and workflow id.
>
> Return **only**: the deployed commit (full SHA + short), the deploy run id and the time it finished, whether the target fix/PR is present and the evidence you used to decide, and any relevant caveat. Do not paste raw `gh run list` output or file contents.

If the optional live cross-check (step 4) is needed, the subagent can itself delegate to the `network-logs` agent.

## Network → deploy workflow

| Network | Workflow | id | Repo with run history | Source | Cadence |
|---|---|---|---|---|---|
| next-net | Deploy Next Net | 235418088 | aztec-packages-private | `next` branch (latest nightly tag) | nightly, cron `0 6 * * *` UTC (runs typically start/finish ~07:30–08:25 UTC due to GitHub schedule lag) |
| devnet | Devnet Auto-Deploy | 235418089 | aztec-packages-private | `v*-devnet-*` branch | on push to the devnet branch; that branch is created on demand by "Create Devnet" (id 235418083, `workflow_dispatch` only) from a chosen nightly tag |
| staging (public) | Deploy to staging public | 244296513 | aztec-packages (PUBLIC) | `next` → `v5.0.0-nightly.<date>` tag | nightly, cron `0 6 * * *` UTC |
| staging (internal) | Deploy to staging internal | 292462388 | aztec-packages-private | `next` → `v5.0.0-nightly.<date>` tag | nightly, cron `0 6 * * *` UTC |

> Watch the repo column. The scheduled "Deploy to staging public" run is gated to `github.repository == 'aztec-labs-eng/aztec-node'`, so in the **private** repo those runs show as `skipped` — its real run history lives in the **public** `aztec-packages` repo. The other three deploy from the private repo.

Re-confirm ids/branches with `gh workflow list -R AztecProtocol/aztec-packages-private --all` and the YAML under `.github/workflows/`.

## Procedure

The subagent runs these steps. Use the repo from the table above for each network — private for most, public (`aztec-labs-eng/aztec-node`) for staging-public — substituting it for `-R AztecProtocol/aztec-packages-private` in the commands below.

1. **Find the live commit at time T.** Use the repo from the table above (either private or public):
   ```bash
   gh run list -R AztecProtocol/aztec-packages-private --workflow <id> --limit 20 \
     --json databaseId,headSha,conclusion,createdAt \
     --jq '.[] | "\(.createdAt) \(.conclusion) \(.headSha[0:12]) run=\(.databaseId)"'
   ```
   Take the most recent line with conclusion `success` at/before T; skip `failure`/`cancelled`. Note the full headSha. Confirm it finished before the event you're investigating:
   ```bash
   gh run view <run-id> -R AztecProtocol/aztec-packages-private --json startedAt,updatedAt,conclusion
   ```

2. **Inspect code at that commit (no clone needed):**
   ```bash
   gh api "repos/AztecProtocol/aztec-packages-private/contents/<path>?ref=<sha>" \
     -H "Accept: application/vnd.github.raw+json"
   ```
   Read the actual file content at the ref — more reliable than commit-ancestry because fixes get ported across branches/repos with different hashes.

3. **Is fix X present?** Match by the *code change* or commit message, not the PR number — public and private PR numbers differ (e.g. public #23940 == private port #23975). Do not rely on commit SHA either, these may change when squashing. For an ancestry check instead:
   ```bash
   gh api "repos/AztecProtocol/aztec-packages-private/compare/<base>...<head>"
   ```
   and read `status` (`ahead`/`identical` ⇒ base contains head).

4. **(Optional) Live cross-check** via GCP Cloud Logging (project `testnet-440309`, namespace = the network name, e.g. `next-net`): grep for the bug's runtime log signature over the last ~24h; its absence while the namespace is actively logging corroborates the fix is live. This is the `network-logs` agent's domain — delegate to it for a thorough query.

## Caveats
- A deploy run's `headSha` is the source branch tip at deploy-trigger time. Runs often finish in minutes, implying they deploy **prebuilt images** for that commit rather than building from scratch — if you need byte-level certainty, confirm the deployed image was built from that SHA.
- Always check run `conclusion`; never assume "the nightly for date D" succeeded. (eg at the time of writing, staging-internal nightlies were failing for several days straight — exactly the case where the live commit is older than the latest run.)
