---
name: network-logs
description: Query and analyze logs from live Aztec network deployments on GCP Cloud Logging
argument-hint: <natural language query, e.g. "has testnet started producing blocks?">
---

# Network Log Analysis

When you need to query or analyze logs from live Aztec network deployments (devnet, testnet, mainnet, or custom namespaces), delegate to the `network-logs` subagent.

## Usage

1. **Parse the user's query** to extract:
   - **Namespace**: The deployment to query (e.g., `testnet`, `devnet`, `mainnet`, or a custom namespace like `prove-n-tps-real`). If not specified, default to `testnet`.
   - **Intent**: What they want to know (block production, errors, proving status, specific pod logs, etc.)
   - **Time range**: How far back to look (default: 1 hour). Convert relative references like "last 3 hours" to a freshness value.
   - **Scope**: Specific pods, severity levels, or modules to focus on.

2. **Spawn a general-purpose subagent** using the Agent tool. Every prompt MUST start with the instruction to read the agent file first, followed by the query details:

```
FIRST: Read the file .claude/agents/network-logs.md for full instructions on how to query GCP logs. Follow ALL rules in that file, especially the "IMPORTANT: Command Rules" section — never pipe, redirect, or use Python.

Then: <namespace, intent, time range, original question>
```

## Examples

**User asks:** "has testnet started producing blocks?"

**You do:** Spawn agent with prompt:
```
FIRST: Read the file .claude/agents/network-logs.md for full instructions on how to query GCP logs. Follow ALL rules in that file, especially the "IMPORTANT: Command Rules" section — never pipe, redirect, or use Python.

Then: Namespace: testnet. Check if blocks are being produced. Look for "Validated block proposal" or "Cannot propose" messages on validator pods. Freshness: 1h. Original question: has testnet started producing blocks?
```

**User asks:** "any errors on devnet in the last 3 hours?"

**You do:** Spawn agent with prompt:
```
FIRST: Read the file .claude/agents/network-logs.md for full instructions on how to query GCP logs. Follow ALL rules in that file, especially the "IMPORTANT: Command Rules" section — never pipe, redirect, or use Python.

Then: Namespace: devnet. Find unexpected errors. Query severity>=WARNING, exclude known noise patterns and L1 messages. Freshness: 3h. Original question: any errors on devnet in the last 3 hours?
```

**User asks:** "how long did testnet take to prove epoch 5?"

**You do:** Spawn agent with prompt:
```
FIRST: Read the file .claude/agents/network-logs.md for full instructions on how to query GCP logs. Follow ALL rules in that file, especially the "IMPORTANT: Command Rules" section — never pipe, redirect, or use Python.

Then: Namespace: testnet. Determine proving duration for epoch 5. Find "Starting epoch 5 proving job" and "Finalized proof" timestamps on prover-node pods. Freshness: 24h. Original question: how long did testnet take to prove epoch 5?
```

**User asks:** "what's happening on devnet-validator-0?"

**You do:** Spawn agent with prompt:
```
FIRST: Read the file .claude/agents/network-logs.md for full instructions on how to query GCP logs. Follow ALL rules in that file, especially the "IMPORTANT: Command Rules" section — never pipe, redirect, or use Python.

Then: Namespace: devnet. Get recent logs from pod devnet-validator-0. Freshness: 1h. Original question: what's happening on devnet-validator-0?
```

## Do NOT

- Do NOT run `gcloud logging read` directly — always delegate to the `network-logs` subagent
- Do NOT guess at log contents — always query live data
- Do NOT assume a namespace — ask the user if ambiguous (but default to `testnet` for common queries)
