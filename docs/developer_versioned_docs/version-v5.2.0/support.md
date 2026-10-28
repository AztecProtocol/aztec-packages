---
title: Support
sidebar_position: 5
description: Where to ask questions, report bugs, request features, and disclose security issues for the Aztec stack.
---

This page tells you where to go when something does not work, when you want to file a bug, when you have a feature idea, or when you have found a possible security issue. Pick the section that matches your situation.

:::warning Security issues are different
If your issue involves loss of funds, key or seed disclosure, leakage of private notes, a way to forge or replay transactions, or anything you suspect could harm users, **do not open a public GitHub issue or post in Discord**. Use the [security disclosure process](#security-issues) instead.
:::

## Quick decision tree

| Your situation | Where to go |
| --- | --- |
| Possible security issue (funds, keys, privacy, exploit) | [Security disclosure](#security-issues) |
| You are not sure if the bug is real, or you cannot reproduce it yet | [Ask first: Forum or Discord](#ask-first-forum-and-discord) |
| You have a reproducible bug in `aztec-packages` (PXE, aztec.js, aztec-nr, local network, CLI, AVM, barretenberg, L1 contracts) | [File a bug on GitHub](#file-a-bug) |
| You have a Noir compiler or language bug | [Noir issues on `noir-lang/noir`](https://github.com/noir-lang/noir/issues) |
| You have a feature request or enhancement idea | [File a feature request](#feature-requests) |
| You are running a node, sequencer, or prover and hit an operator problem | [Operator support](#operator-and-node-issues) |
| You want to suggest a documentation change | [File a docs issue](#documentation-issues) |

## Ask first: Forum and Discord

If you are not yet sure whether your problem is a real bug or a configuration issue, start in the community channels. You can often get a faster answer there, and the team can help you build a minimal reproduction before you open a GitHub issue.

- [Noir Discord](https://discord.com/invite/JtqzkdeQ6G): the developer-focused channel for syntax issues, compiler questions, and language-level help with Aztec.nr contracts.
- [Aztec Forum](https://forum.aztec.network): long-form Q&A, best for design discussions, complex bug reports, and conversations you want indexed and searchable.
- [Aztec Discord](https://discord.gg/aztec): the broader Aztec community space, and the live support channel for node operators (sequencers, provers, RPC nodes).

Once you have a clear reproduction, the right next step is to file a GitHub issue using the form below.

## File a bug

Reproducible bugs in the Aztec stack belong on GitHub. Use the bug template, which automatically labels your issue and helps a maintainer triage it.

[Open a new bug report](https://github.com/AztecProtocol/aztec-packages/issues/new?template=bug_report.yml)

### What a high-quality bug report includes

The template asks for these, and your issue will be triaged faster if you provide all of them.

1. **Aztec version**, for example `0.85.0-alpha-testnet.2`. Use `aztec-up list` if you are not sure.
2. **What you were trying to do**, in one or two sentences.
3. **A minimal, runnable reproduction**. A code snippet that compiles, or a link to a public repo branch, is much more useful than prose. If your reproduction is large, please trim it before filing.
4. **Expected vs. actual behavior**.
5. **Environment**: operating system, Node.js version, and browser if relevant.
6. **Logs and errors**: the failing block, ideally with `LOG_LEVEL=debug` for the module that failed.
7. **What you already tried**: workarounds, version downgrades, related issues you read.

### Where bugs in specific components go

All of the components below live in [`AztecProtocol/aztec-packages`](https://github.com/AztecProtocol/aztec-packages), so use the bug template above and let triage attach the component label.

- **PXE, wallet, CLI**: `aztec`, `aztec-wallet`, `aztec.js`, `bb.js`, local network.
- **Aztec.nr framework**: the `aztec-nr` smart contract framework.
- **Protocol circuits or protocol specs**: the rollup, kernels, and other circuits.
- **Barretenberg, AVM, L1 contracts**: the prover backend, the Aztec Virtual Machine, and the Ethereum-side rollup contracts.

For the **Noir compiler** or the Noir language itself, file on [`noir-lang/noir`](https://github.com/noir-lang/noir/issues) instead.

## Feature requests

Use the feature request template for new functionality, enhancements to existing components, or proposed changes to the developer experience.

[Open a feature request](https://github.com/AztecProtocol/aztec-packages/issues/new?template=feature_request.yml)

Include:

- The problem you are trying to solve.
- A concrete example or use case, if you have one.
- Why this is impactful: what is unblocked or made easier if it ships.

## Documentation issues

If something in the docs is wrong, outdated, or missing, please **[open an issue](https://github.com/AztecProtocol/aztec-packages/issues/new?template=bug_report.yml)** with the bug template and quote the URL and paragraph that needs fixing. Docs issues are routed to [`@AztecProtocol/devrel`](https://github.com/orgs/AztecProtocol/teams/devrel) so a docs maintainer can pick them up.

This includes typos and small text issues: please file them as issues rather than opening single-line PRs. A maintainer can fix several at once, which is faster to review than a stream of one-line pull requests.

For larger restructures or new pages, open an issue first so a maintainer can confirm the direction before you write the change. Every docs page in this site has an "Edit this page" link at the bottom that takes you to the right file in [`docs-developers/`](https://github.com/AztecProtocol/aztec-packages/tree/next/docs/docs-developers) once the direction is agreed.

## Operator and node issues

For real-time help, the [Aztec Discord](https://discord.gg/aztec) is the fastest way to reach other operators and the Aztec team. Use it to sanity-check a failure mode before filing, or to coordinate with the team during an incident.

If you are running a node, sequencer, or prover and you hit a reproducible operational problem (sync failures, missed proposals, prover crashes, deployment errors), [open a bug report](https://github.com/AztecProtocol/aztec-packages/issues/new?template=bug_report.yml) and include the following alongside the standard bug-report fields:

- **Network** (mainnet, testnet, devnet, or local).
- **Role** (sequencer, prover, RPC node).
- **Block height at failure** and approximate UTC timestamp.
- **Hardware**: CPU model, RAM, disk type and size.
- **Container runtime and image version**.
- **Configuration** (your `config.json` or environment block, with secrets redacted).
- **Logs**: the last few hundred lines around the failure, with sensitive keys redacted.

Operator-specific guides live in the [Operate section](/operate/operators).

## Security issues

**Do not open a public GitHub issue for a suspected vulnerability.** Public disclosure can put users at risk before a fix is available.

Use one of the following, in order of preference:

1. **[Aztec Network Bug Bounty on Cantina](https://cantina.xyz/bounties/80e74370-10d8-4e52-8e4b-7294deb7c9ee)** if the issue is in scope of the bounty program.
2. **[GitHub Private Vulnerability Reporting (PVR)](https://github.com/AztecProtocol/aztec-packages/security/advisories/new)** for any other suspected vulnerability. Go to the "Security" tab of the repository and click "Report a vulnerability".
3. **Email `security@aztec.foundation`** if neither Cantina nor PVR is available to you. Send a brief impact summary first, without exploit details or reproduction steps, and wait for the team to confirm a secure channel before sharing them.

If you believe a vulnerability is being actively exploited or has severe impact (loss of funds, key compromise, or broad user impact), mark the report as **CRITICAL** in the PVR or email subject.

See the full [security policy](https://github.com/AztecProtocol/aztec-packages/blob/next/SECURITY.md) for more.

## What happens after you file

When you file a GitHub issue using one of the templates above, it is automatically tagged so the team can triage it. A maintainer will:

1. Confirm the component the issue belongs to.
2. Set a priority based on impact.
3. Ask follow-up questions if the report is missing a reproduction or context.
4. Route the issue to the owning team.

The fastest way to a fix is a small, runnable reproduction. If you can attach one, please do.

## See also

- [`CONTRIBUTING.md`](https://github.com/AztecProtocol/aztec-packages/blob/next/CONTRIBUTING.md) for contribution guidelines.
- [`SECURITY.md`](https://github.com/AztecProtocol/aztec-packages/blob/next/SECURITY.md) for the full security disclosure policy.
- The [Aztec project board](https://github.com/orgs/AztecProtocol/projects/22) for in-flight work.
