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
LOG_LEVEL="debug; info: json-rpc, simulator" yarn workspace @aztec/<package-name> test src/file.test.ts    # More detail
# Available levels: trace, debug, verbose, info, warn

# Module-specific logging
LOG_LEVEL='info; debug:sequencer,archiver' yarn workspace @aztec/<package-name> test src/file.test.ts
```

## Format & Lint

**IMPORTANT**: These commands are run from the root of `yarn-project`, NOT the git root.

### Style

- **Line width**: 120 characters (`printWidth: 120` in `.prettierrc.json`). Wrap **everything** at 120 — code, inline comments, and JSDoc/block comments alike. Do not wrap at 80, 90, or 100 out of habit. Prettier does not reflow comment bodies, so an under-wrapped JSDoc paragraph will sit at ~90 chars forever unless you wrote it at 120 to begin with.

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

<typescript_style>

<type_safety>
Avoid `as Type` casts; prefer type guards. Never use `as any`; if a subclass needs access to private members, change visibility to `protected`. Use branded types for common domain types (`SlotNumber`, `BlockNumber`, `EpochNumber`). Type guard functions follow `is<TypeName>` naming.
</type_safety>

<type_colocation>
Colocate type definitions with the code that uses them. Do not create new `types.ts` files unless a circular-dependency issue forces it. When adding a type used by exactly one function, declare it next to that function; when adding a type used by one class, declare it above the class. Extract to a package-level module only when at least three unrelated files need the same type.
</type_colocation>

<data_structures>
**Plain types** for simple local data with free functions + schema in same file. **Classes** for richer structs with serialization, factory, and utility methods. Avoid classes with only static methods; use free functions instead.

For classes, use these static factory methods: `from(FieldsOf<T>)` for synchronous construction, `create()` for async with validation, `fromBuffer()` / `fromString()` for deserialization, `empty()` / `random()` for testing helpers.

Use Zod for validating untrusted input. For classes, define a static `schema` getter. Use `zodFor<T>()` helper for type-safe schema definitions on plain types.

Use interfaces only when multiple implementations exist, exposing APIs to outside consumers, or needing to depend on a type without creating a runtime dependency.
</data_structures>

<error_handling>
Custom errors extend `Error` and set `this.name`. Use error hierarchies with base classes for domains. Include `public readonly` properties for error context.
</error_handling>

<class_style>
Be explicit with `private`/`public`/`protected`. Use `readonly` whenever possible. Method organization: static properties/constants → instance properties → constructor → static factory methods (`from`, `create`, `empty`, `random`) → lifecycle (`start`, `stop`) → public API → protected → private.
</class_style>

<jsdoc>
Document all classes, types, and interfaces with a JSDoc comment explaining their purpose. Document methods and properties unless meaning is obvious from the name. Skip JSDoc for trivial getters/setters, constructor-injected dependencies, and standard lifecycle methods (`start`, `stop`). Interface methods always require JSDoc.

Use `@param` and `@returns` only when parameter names or return types don't convey meaning. Keep comments concise — single-line format when possible. Avoid redundant "title" lines that repeat the name being documented.
</jsdoc>

<enums_and_unions>
Numeric enums for protocol constants that serialize to numbers. String enums for status values and event names. `as const` arrays with derived type for string literal unions. Discriminated unions with `type` field for variant types. Prefer `undefined` over `null`; use `compactArray()` from foundation to filter undefined values.
</enums_and_unions>

<resource_management>
Prefer `using`/`await using` over `try`/`finally` for cleanup of disposable resources. Use `using` for `Disposable` resources (`[Symbol.dispose](): void`), `await using` for `AsyncDisposable` resources (`[Symbol.asyncDispose](): Promise<void>`).
</resource_management>

<kv_store_transactions>
When working with `AztecAsyncKVStore`, wrap related reads and writes in `store.transactionAsync()` to ensure atomicity. Without transactions, concurrent operations can see inconsistent state (e.g., two callers both pass an `exists` check and both write).
</kv_store_transactions>

<general_style>
Prefer `const` over `let`. Prefer `async`/`await` over `.then()`/`.catch()` callbacks. Named exports only (no default exports). Explicit return types on public API methods; inferred types acceptable on private/internal methods. Only export types needed by external consumers. Avoid `const self = this`; use arrow functions.

Prefer high-level collection functions (`find`, `filter`, `map`, helpers from `foundation/src/collection/`) over imperative loops, but prefer imperative loops over `forEach` and complex `reduce`. Prefer `sum(items.map(item => item.value))` over `reduce(...)` for addition.

Simplify function arguments to single expressions where possible. Use expression bodies instead of block bodies when the block only contains a `return`. Block bodies are appropriate when the callback has multiple statements.
</general_style>

<code_duplication>
Avoid duplicating logic unless clarity benefits from keeping it inline. Same class → `private` helper. Same package → free function in a dedicated helper file. Complex logic → dedicated class. For two classes with similar behavior: if public APIs are nearly identical, use inheritance; if behavior overlaps but APIs differ, use composition.

Check `foundation` for existing utilities before reimplementing. Extract general (non-domain) utilities to `foundation`.
</code_duplication>

<collections_and_maps>
Avoid `Set`/`Map` of non-primitive class instances; `has()` checks fail because objects are compared by reference. Use primitive keys (strings, numbers) instead.
</collections_and_maps>

<logging>
Always pass a structured context object as the second argument to log calls — not interpolated strings. The log pipeline indexes on these fields for filtering in production.

```typescript
// correct
this.log.info(`Preparing checkpoint ${checkpointNumber}`, { slot, checkpointNumber, proposer });

// wrong — context is lost to the log pipeline
this.log.info(`Preparing checkpoint ${checkpointNumber} for slot ${slot} by ${proposer}`);
```

Available levels in order: `trace`, `debug`, `verbose`, `info`, `warn`, `error`.
</logging>

<import_organization>
Order imports: external `@aztec/*` packages → foundation utilities (`@aztec/foundation/*`) → protocol-specific packages → Node.js built-ins (`node:events`, `node:fs`) → third-party packages (`viem`, `zod`) → relative imports (with `.js` extension). Use `import type` for type-only imports.
</import_organization>

<event_handling>
Use `TypedEventEmitter<TEventMap>` interface for typed events.
</event_handling>

</typescript_style>

<ci_config>
When a test intermittently fails but shouldn't block CI, edit `.test_patterns.yml` (at the git root, not in yarn-project) and add an entry under `tests:`. Without `error_regex`, the test is always flagged as flaky when it fails. With `error_regex`, only flagged when output matches. `skip: true` disables the test entirely (avoid unless constantly failing). Flaky tests alert owners in #aztec3-ci Slack but don't fail CI.
</ci_config>

## Dependency Management

After modifying any `package.json`:

```bash
yarn && yarn prepare
```

`yarn prepare` regenerates the `references` array in every workspace `tsconfig.json` from the `dependencies` field via `@monorepo-utils/workspaces-to-typescript-project-references`. Never hand-edit the `references` array — the next `yarn prepare` will overwrite any manual changes, and forgetting to run it leaves `tsc -b` incremental builds in an inconsistent state.

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

Conventional commit types, branch strategy, merge-train routing, and base-branch detection live in the root `CLAUDE.md` under `<git_workflow>`. The sections below cover only yarn-project-specific additions.

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
