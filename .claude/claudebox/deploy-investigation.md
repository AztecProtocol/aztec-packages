# ClaudeBox Deploy Investigation

Instructions for ClaudeBox when investigating a deployment failure.
This is triggered by `deploy-network.yml` when a deployment fails.

## Context

You will receive a prompt like:
> Deployment of NETWORK (version SEMVER) failed.
> Follow .claude/claudebox/deploy-investigation.md to investigate.
> GitHub Actions run: RUN_URL. Network: NETWORK. Version: SEMVER.
> Docker image: IMAGE_TAG. Git ref: REF. Namespace: NAMESPACE.
> Deploy contracts: true|false.

Extract these variables from the prompt:
- `NETWORK`: the network name (e.g., `testnet`, `staging-public`, `next-net`)
- `SEMVER`: the version being deployed
- `RUN_URL`: the GitHub Actions run URL
- `RUN_ID`: the numeric ID at the end of `RUN_URL`
- `NAMESPACE`: the Kubernetes namespace (usually same as NETWORK)
- `IMAGE_TAG`: the Docker image tag
- `DEPLOY_CONTRACTS`: whether fresh contract deployment was requested

## Constraints

You are running inside ClaudeBox. You do **not** have `gh` CLI or `git push`.
Use MCP tools instead: `github_api`, `respond_to_user`.

## Workflow

### 1. Fetch the Failed Job

```
github_api(method="GET", path="repos/aztec-labs-eng/aztec-node/actions/runs/<RUN_ID>/jobs")
```

Find the job with `conclusion: "failure"`. Extract its `id` and note which step failed
(look at the `steps` array for the step with `conclusion: "failure"`).

### 2. Download GitHub Actions Job Logs

```
github_api(method="GET", path="repos/aztec-labs-eng/aztec-node/actions/jobs/<JOB_ID>/logs")
```

The GitHub Actions logs are a wrapper. The **actual detailed logs** are on
ci.aztec-labs.com. Look for lines like:

```
Executing: <command> (http://ci.aztec-labs.com/<HASH>)
   0 . failed (Xs) (http://ci.aztec-labs.com/<HASH>)
```

Extract the `ci.aztec-labs.com/<HASH>` URL(s) from the logs. The hash after the
failed command is the one you need.

### 3. Download and Analyze CI Logs

Use `yarn ci dlog` to download the actual failure logs:

```bash
cd yarn-project && yarn ci dlog <HASH> > /tmp/<HASH>.log 2>&1
```

Read the downloaded log to find the root cause. These logs contain the real
Terraform output, Helm errors, script failures, etc.

If the log references further nested ci.aztec-labs.com URLs, follow them the same
way to get to the deepest failure.

Look for:
- Terraform errors (plan/apply failures, state locks, quota limits)
- Helm/Kubernetes errors (pod timeouts, image pull failures)
- Contract deployment errors (L1 tx reverts, gas issues)
- Script errors (missing env vars, bad config)

### 4. Categorize the Failure

**Infrastructure failures:**
- Terraform plan/apply errors (resource conflicts, quota limits, state locks)
- GCP authentication issues
- GKE cluster connectivity problems
- Helm release failures (timeout waiting for pods)

**Application failures:**
- Container crash loops (OOMKilled, startup probe failures)
- Contract deployment failures (L1 transaction reverts, gas issues)
- Configuration errors (missing env vars, invalid addresses)

**Network/external failures:**
- L1 RPC endpoint unreachable
- Docker image not found or pull rate limited
- DNS resolution failures

### 5. Query Network Logs (conditional)

If the deployment got far enough that pods were created but the network failed to
start (e.g., "waiting for network to be ready" timeout, Helm succeeded but health
checks failed), query network logs for application-level errors.

Read `.claude/skills/network-logs/SKILL.md` for instructions, then use the
`network-logs` agent to query:
- Namespace: `<NAMESPACE>`
- Freshness: 30 minutes
- Focus: startup errors, crash loops, contract deployment failures

**Skip this step** if the failure was clearly infrastructure-level (Terraform error,
image pull failure, GCP auth issue, etc.).

### 6. Report Findings

Use `respond_to_user()` to reply to the Slack alert thread with a concise summary.

Format for Slack mrkdwn:

```
:red_circle: *Deploy Investigation: <NETWORK> v<SEMVER>*

*Root cause*: <one-line summary of what went wrong>

*Failed step*: "<step name>"

*Error*:
> <key error message, 1-3 lines>

*Category*: <infrastructure | application | external>

*CI log*: http://ci.aztec-labs.com/<HASH>

<If applicable>
*Suggested fix*: <what to do next — retry, fix config, increase quota, etc.>

<If network logs were queried>
*Network logs*: <relevant findings>

<RUN_URL|Full workflow logs>
```

Keep it concise and actionable — operators need to act quickly on deploy failures.

If you cannot determine the root cause, say so and provide what you found.

**Do NOT attempt to fix the deployment or re-run it. Investigation only.**
