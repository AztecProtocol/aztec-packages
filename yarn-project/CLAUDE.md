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

## Essential Workflow

### When to Run Bootstrap

**ONLY** run `./bootstrap.sh` from the git root when:

- Pulling new changes that have modifications outside `yarn-project`
- Switching branches with changes from outside `yarn-project`

```bash
cd $(git rev-parse --show-toplevel) && ./bootstrap.sh
```

**DO NOT** run bootstrap in any other circumstance - it takes several minutes.

### Compile Before Testing

```bash
yarn tsc -b                      # Full project (from yarn-project)
cd <package-name> && yarn tsc -b  # Specific package
```

### Before Committing (Quality Checklist)

Run from `yarn-project`:

1. **Build**: Ensure entire project compiles (`yarn tsgo -b --emitDeclarationOnly`)
2. **Format**: Run on modified packages (`./bootstrap.sh format <package-name>`)
3. **Lint**: Run on modified packages (`./bootstrap.sh lint <package-name>`)
4. **Test**: Run unit tests for modified packages
5. **Document**: Update changelog/release notes (see .claude/skills/update-changelog/SKILL.md)

## Testing

**NEVER run `yarn test` from the project root** - always cd into a specific package first.

### Standard Tests

```bash
cd <package-name>
yarn test src/subdir/file.test.ts                 # Run test file
yarn test src/subdir/file.test.ts -t 'test name'  # Run specific test
```

### End-to-End Tests

- Never run multiple e2e tests in parallel
- E2e tests take significant time
- Tests log "Running test TEST NAME" to track progress

```bash
cd end-to-end
yarn test:e2e e2e_something.test.ts
```

### Sequential Testing (Port Conflicts)

Some packages (e.g., `ethereum`) require sequential execution:

```bash
cd <package-name>
yarn test --runInBand
```

### Test Logging

```bash
env LOG_LEVEL=verbose yarn test src/file.test.ts  # Recommended level
env LOG_LEVEL=debug yarn test src/file.test.ts    # More detail
# Available levels: trace, debug, verbose, info, warn

# Module-specific logging
env LOG_LEVEL='info; debug:sequencer,archiver' yarn test src/file.test.ts
```

## Format & Lint

All commands run from `yarn-project`.

### Single Package (Preferred)

```bash
./bootstrap.sh format <package-name>
./bootstrap.sh lint <package-name>
```

### All Packages

Only when multiple packages are modified:

```bash
./bootstrap.sh format
./bootstrap.sh lint
```

### Check Mode (No Changes)

```bash
./bootstrap.sh format <package-name> --check
./bootstrap.sh lint <package-name> --check
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

When fixing an existing PR (CI failures, review feedback, etc.), always amend the existing commit - never create new commits.

```bash
git add .
git commit --amend --no-edit
git push --force-with-lease
```

This keeps the PR as a single commit. CI enforces PRs have a single commit.

### Breaking Changes

1. Update `docs/docs/developers/migration_notes.md` (path from git root)
2. Document breaking changes in PR description

### PR Descriptions

Do not use checklists (`- [ ]`) in PR descriptions unless explicitly requested—use regular bullet points instead.

### CI Labels

- **`ci-no-squash`**: Preserve individual commits (don't squash on merge)
- **`ci-no-fail-fast`**: Run all tests even if some fail (useful for surveying multiple failures)
