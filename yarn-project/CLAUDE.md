# Aztec TypeScript Monorepo Development Guide

## Overview

Aztec is a privacy-first Layer 2 zk-rollup on Ethereum that supports smart contracts with both private and public state and execution.

Private execution happens on the user device. A **transaction** sent by the user contains a set of note commitments, nullifiers, logs, and public function calls, along with a zk-proof that proves correct execution. These transactions are added to **blocks** by a **sequencer**, who also executes any public calls from the transaction. Blocks are grouped into **checkpoints** and submitted to L1. Checkpoints are grouped into **epochs** and proven via a rollup validity proof, which gets verified on L1.

An Aztec **node** syncs L2 state and serves RPC requests. A node may also act as a **validator** by staking, in which case it may be selected as a **proposer** to assemble transactions into blocks, and as part of a **validation committee** to participate in consensus by signing attestations. A **prover** node generates validity proofs for epochs and submits them to L1.

## Project Structure

- **TypeScript monorepo** with each folder being a package
- **Working directory**: `yarn-project`
- **Main branch**: `master`
- **Development branch**: `next` (most changes go here first)

## Native Tools Over Bash

Prefer native tools over bash equivalents—they don't require permissions and provide better output:

- **Glob** instead of `ls`, `find`, or `tree` for listing/finding files
- **Read** instead of `cat`, `head`, `tail` for reading files
- **Grep** instead of `grep`, `rg` for searching content
- **Edit/Write** instead of `sed`, `awk`, `echo >` for modifying files

## Bash Command Rules

**NEVER `cd` before running a command.** The working directory is already `yarn-project`. Run commands directly:

```bash
# GOOD
yarn build
yarn workspace @aztec/sequencer-client test src/file.test.ts
git diff HEAD

# BAD — never do this
cd /home/santiago/Projects/aztec-3/yarn-project && yarn build
cd /home/santiago/Projects/aztec-3 && git diff HEAD
```

Git commands work from any subdirectory of a repo—there is no need to `cd` to the git root. The Bash tool already runs in `yarn-project`, so never prefix commands with `cd` to `yarn-project` or the git root.

**NEVER append `; echo "EXIT: $?"` or similar** to any command. The Bash tool already reports exit codes directly.

## Essential Workflow

### When to Run Bootstrap

**ALWAYS** run `./bootstrap.sh` from the git root when:

- Pulling new changes that have modifications outside `yarn-project`
- Switching branches with changes from outside `yarn-project`
- Rebasing on a branch that has changes outside `yarn-project`

```bash
(cd $(git rev-parse --show-toplevel) && ./bootstrap.sh build yarn-project)
```

Bootstrap takes several minutes to run. Be patient.

### Compile Before Testing

Always run `yarn build` from the `yarn-project` root. Never run `tsgo` directly, never build specific packages—always build the full project:

```bash
yarn build
```

### Before Committing (Quality Checklist)

Run from `yarn-project`:

1. **Build**: Ensure entire project compiles (`yarn build`)
2. **Format**: Run on entire project (`yarn format`)
3. **Lint**: Run on entire project (`yarn lint`)
4. **Test**: Run unit tests for modified files
5. **Document**: Update changelog/release notes via the `/update-changelog` skill

## Testing

Use `yarn workspace` to run tests without changing directories:

```bash
yarn workspace @aztec/<package-name> test src/file.test.ts                 # Run test file
yarn workspace @aztec/<package-name> test src/file.test.ts -t 'test name'  # Run specific test
```

### Capturing Test Output

For long-running tests or verbose output, redirect to a temp file and use native tools to examine:

```bash
yarn workspace @aztec/<package-name> test src/file.test.ts > /tmp/test-output.log 2>&1
```

Then use **Read** or **Grep** to examine `/tmp/test-output.log`. Never use `| tail` or `| head` to limit output—use native tools instead.

### End-to-End Tests

- Never run multiple e2e tests in parallel
- E2e tests take significant time
- Tests log "Running test TEST NAME" to track progress

```bash
yarn workspace @aztec/end-to-end test:e2e e2e_something.test.ts
```

### Sequential Testing (Port Conflicts)

Some packages (e.g., `ethereum`) require sequential execution:

```bash
yarn workspace @aztec/<package-name> test --runInBand
```

### Test Logging

```bash
LOG_LEVEL=verbose yarn workspace @aztec/<package-name> test src/file.test.ts  # Recommended
LOG_LEVEL=debug yarn workspace @aztec/<package-name> test src/file.test.ts    # More detail
# Available levels: trace, debug, verbose, info, warn

# Module-specific logging
LOG_LEVEL='info; debug:sequencer,archiver' yarn workspace @aztec/<package-name> test src/file.test.ts
```

## Format & Lint

**IMPORTANT**: These commands are run from the root of `yarn-project`, NOT the git root.

### Style

- **Line width**: 120 characters (`printWidth: 120` in `.prettierrc.json`). Wrap comments and code at 120, not 80.

### Format

```bash
yarn format                             # All packages
yarn format <package>                   # Single package (faster)
yarn format --check                     # Check only, no changes
```

### Lint

```bash
yarn lint                               # Run this before pushing
yarn lint <pkg1>                        # Single package (faster)

```

## Dependency Management

After modifying any `package.json`:

```bash
yarn && yarn prepare
```

## Key Packages

### Server (Node)

Packages that run on Aztec network nodes:

- **aztec-node**: Main entrypoint for running an Aztec node, integrates all server components
- **sequencer-client**: Builds blocks from pending transactions and coordinates with validators
- **validator-client**: Handles block validation and attestation signing for consensus
- **prover-node**: Standalone prover node that generates proofs for epoch proving
- **prover-client**: Orchestrates proof generation, manages proving broker and queues
- **archiver**: Indexes and stores L2 block data fetched from L1 for historical queries
- **world-state**: Maintains the global Merkle tree state (note hashes, nullifiers, public data)
- **p2p**: Peer-to-peer networking layer using libp2p for transaction and block propagation
- **slasher**: Subsystem for detecting and collecting slashable offenses

### Client (Wallet/PXE)

Packages that run on user devices:

- **pxe**: Main client-side library for orchestrating private tx execution and proving
- **aztec.js**: JavaScript SDK for building dApps, interacting with contracts and accounts
- **accounts**: Sample account contract implementations (ECDSA, Schnorr, etc.)
- **key-store**: Manages user's private keys and key derivation for the PXE
- **entrypoints**: Transaction entrypoint implementations for account abstraction

### Shared

Core libraries used by both server and client:

- **stdlib**: Protocol-level types (transactions, blocks, proofs) and domain interfaces
- **foundation**: Low-level utilities (crypto primitives, logging, serialization, async helpers)
- **constants**: Protocol constants shared between TypeScript and Noir circuits
- **simulator**: ACIR/AVM circuit simulation for both private and public execution
- **protocol-contracts**: Canonical protocol contracts (registries, fee contracts, etc.)
- **noir-protocol-circuits-types**: TypeScript bindings for Noir protocol circuits
- **bb-prover**: Barretenberg prover integration for generating ZK proofs
- **ethereum**: L1 contract interactions, deployment, and rollup publishing
- **kv-store**: Key-value storage abstraction (LMDB for server, IndexedDB for browser)

## Git & PR Guidelines

### Branch Naming

Prefix branches with author initials (derived from `git config user.initials` or `git config user.name`):

```
ab/feature-name
jd/fix-something
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

**Supported types**: `fix`, `feat`, `chore`, `refactor`, `docs`, `test`

```
<type>(<scope>): <description>

[optional body]
```

### Branch Strategy

- **Primary development**: `next` branch (default PR target)
- **Production**: `master` branch
- **Merge trains**: Some teams use `merge-train/*` branches (e.g., `merge-train/barretenberg`, `merge-train/spartan`) to batch PRs before merging into `next`. If the current branch targets a `merge-train/*` branch, use that as the base -- not `next`. See the `merge-trains` skill for details.
- **Backport**: Fix in release branch -> forward-port to `next`
- **Forward-port**: Fix in `next` -> backport if needed

### Determining the Base Branch

**Never assume the base branch is `master`**. Most branches are based on `next`, not `master`. When you need to compare commits or understand changes on a branch:

```bash
# If there's an open PR, check its base branch
gh pr view --json baseRefName -q '.baseRefName'

# Compare against the correct base
git log origin/<base-branch>..HEAD   # commits on this branch
git diff origin/<base-branch>...HEAD  # changes on this branch
```

### Port Commits

When porting PRs between branches, include reference to original PR(s) in the PR body. Use the exact same commit message with the original PR number.

### PR Merging

Every PR is required by CI to consist of a single commit in order to be merged.

For PRs with multiple commits that should be preserved (e.g., porting multiple PRs):

1. Ensure each commit follows conventional commit format
2. Add label `ci-no-squash` to the PR

### Fixing PRs

PRs are squashed to a single commit on merge, so during development just create normal commits. Only amend when explicitly asked or when using the `/fix-pr` skill on a PR targeting `next`.

```bash
git add .
git commit -m "fix: address review feedback"
git push
```

### Breaking Changes

1. Use the `/update-changelog` skill for documenting any breaking changes
2. Document breaking changes in PR description

### PR Descriptions

Do not use checklists (`- [ ]`) in PR descriptions unless explicitly requested—use regular bullet points instead.

### CI Labels

- **`ci-no-squash`**: Preserve individual commits (don't squash on merge)
- **`ci-no-fail-fast`**: Run all tests even if some fail (useful for surveying multiple failures)
