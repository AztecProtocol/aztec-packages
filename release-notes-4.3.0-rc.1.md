# Release Notes: v4.2.1 → v4.3.0-rc.1

**Date:** 2026-05-15
**Range:** `v4.2.1..v4.3.0-rc.1` (2026-05-07 → 2026-05-15)
**Commits:** 225 non-merge commits

Full migration instructions for every breaking change below live in [`docs/docs-developers/docs/resources/migration_notes.md`](docs/docs-developers/docs/resources/migration_notes.md).

> **Note**: This is a draft release-notes file generated from commit history. Curate the headline sections (Summary, Breaking Changes, Highlights) before publishing. The detailed change log lives in [`CHANGELOG.md`](CHANGELOG.md).

---

## Summary

`v4.3.0-rc.1` is the first release candidate of the v4.3 line, cut after the `v4.2.x` series stabilized on the Alpha network. The release rolls up roughly 225 commits backported to `v4-next` since `v4.2.1` and is primarily focused on **PXE / wallet-side improvements**, **kv-store on SQLite-wasm**, and **Aztec.nr / TXE ergonomics**. Beyond the three breaking changes listed below, the release is dominated by bug fixes, refactors that improve sync performance, and tooling improvements.

---

## Breaking Changes

- **`aztec init` / `aztec new` counter template** ([#22751](https://github.com/AztecProtocol/aztec-packages/pull/22751)): `aztec init` / `aztec new` now scaffold a *counter* template instead of the previous default. Any tooling or docs that relied on the prior scaffold contents must be updated.

- **Shared protocol-circuit utilities in the history module** (`refactor!` cherry-pick `8f805bb8d3`): The `aztec-nr` history module now consumes shared protocol-circuit utilities. Direct consumers of internal history-module helpers must adapt — see migration notes.

---

## Highlights

### PXE / Wallet

- **New opt-in SQLite kv-store backend** ([#22658](https://github.com/AztecProtocol/aztec-packages/pull/22658), [#22759](https://github.com/AztecProtocol/aztec-packages/pull/22759), [#23089](https://github.com/AztecProtocol/aztec-packages/pull/23089), [#23231](https://github.com/AztecProtocol/aztec-packages/pull/23231)): A new SQLite-on-WASM-over-OPFS implementation of the PXE / wallet kv-store ships alongside the existing LMDB and IndexedDB backends, with a page-level-encrypted variant for stricter browser environments. The new backend is **opt-in** at wallet construction time; existing PXE stores continue to work unchanged on LMDB / IndexedDB. SQLite is expected to become the recommended default in v5, with IndexedDB deprecated thereafter.
- **Cross-contract utility call hooks and auth** ([#23007](https://github.com/AztecProtocol/aztec-packages/pull/23007), [#23064](https://github.com/AztecProtocol/aztec-packages/pull/23064), [#22822](https://github.com/AztecProtocol/aztec-packages/pull/22822)): PXE gains execution hooks for authorizing cross-contract utility calls, and TXE supports authorizing them in Noir tests. Nested utility-function calls are now supported end-to-end.
- **Sync performance** ([#23129](https://github.com/AztecProtocol/aztec-packages/pull/23129), [#23131](https://github.com/AztecProtocol/aztec-packages/pull/23131), [#23123](https://github.com/AztecProtocol/aztec-packages/pull/23123), [#23130](https://github.com/AztecProtocol/aztec-packages/pull/23130), [#23100](https://github.com/AztecProtocol/aztec-packages/pull/23100), [#23088](https://github.com/AztecProtocol/aztec-packages/pull/23088), [#23048](https://github.com/AztecProtocol/aztec-packages/pull/23048), [#22988](https://github.com/AztecProtocol/aztec-packages/pull/22988), [#22525](https://github.com/AztecProtocol/aztec-packages/pull/22525)): A series of refactors batches nullifier sync across scopes, batches log RPC calls, prefetches updated class-id hints per contract, short-circuits block-header lookups at the anchor block, and parallelizes per-scope contract syncs.
- **Tag-as-sender optimization** ([#23239](https://github.com/AztecProtocol/aztec-packages/pull/23239)): Faster `get_next_app_tag_as_sender` lookups.
- **wallet-sdk heartbeat** ([#22948](https://github.com/AztecProtocol/aztec-packages/pull/22948)): Wallet SDK now emits a heartbeat for liveness signalling.

### Aztec.nr / TXE

- **TXE oracle versioning** ([#23285](https://github.com/AztecProtocol/aztec-packages/pull/23285), [#23289](https://github.com/AztecProtocol/aztec-packages/pull/23289)): TXE gains oracle versioning for the test environment and basic gas settings, mirroring production behavior more closely.
- **Initial handshake registry contract** ([#22854](https://github.com/AztecProtocol/aztec-packages/pull/22854)): New handshake registry contract with non-interactive handshake function for offchain message delivery.
- **`call_self` utility stubs** ([#22885](https://github.com/AztecProtocol/aztec-packages/pull/22885)): Aztec.nr utility functions gain `call_self` stubs for cleaner self-invocation patterns.
- **Serializability assertions** ([#22877](https://github.com/AztecProtocol/aztec-packages/pull/22877)): Aztec.nr now asserts that contract function return types and parameters are serializable, catching a common compile-time class of bugs.
- **Offchain delivered private transfer** ([#22574](https://github.com/AztecProtocol/aztec-packages/pull/22574)): Example/infra for offchain-delivered private transfers.
- **Oxide upstream merge** ([#22979](https://github.com/AztecProtocol/aztec-packages/pull/22979)): Oxide aztec-nr changes upstreamed.

### CLI / `aztec-up`

- **`aztec dep` version check** ([#21245](https://github.com/AztecProtocol/aztec-packages/pull/21245)): Asserts the aztec-nr dependency version matches the CLI version.
- **Multi-crate scaffolding** ([#21007](https://github.com/AztecProtocol/aztec-packages/pull/21007), [#20681](https://github.com/AztecProtocol/aztec-packages/pull/20681), [#20723](https://github.com/AztecProtocol/aztec-packages/pull/20723), [#20729](https://github.com/AztecProtocol/aztec-packages/pull/20729)): `aztec new` and `aztec init` now create a 2-crate workspace, warn if the contract crate has tests, and auto-recompile when `aztec test` is run.
- **Contract version stamping** ([#22550](https://github.com/AztecProtocol/aztec-packages/pull/22550)): Contract artifacts now stamp the `aztec` version they were compiled against.
- **`aztec profile gates --json`** ([#22860](https://github.com/AztecProtocol/aztec-packages/pull/22860)): JSON output for `aztec profile gates`.

### Docs

- **Node JSON-RPC API reference auto-generated** (commit `de6e69f8fa`): The node JSON-RPC API reference is now generated from the TypeScript source.
- **Aztec.nr API reference discoverability** ([#22861](https://github.com/AztecProtocol/aztec-packages/pull/22861)): Aztec.nr API reference docs are more discoverable in the sidebar.
- **Nethermind / FPC docs** ([#22541](https://github.com/AztecProtocol/aztec-packages/pull/22541) and `2511d876d7`): FPC docs applied to developer versioned docs; Nethermind FPC docs added.
- **Alpha Network privacy/limitations page** ([#22515](https://github.com/AztecProtocol/aztec-packages/pull/22515)).

---

## Notable Bug Fixes

- **Dropped tagging indices no longer crash PXE on sync** ([#23044](https://github.com/AztecProtocol/aztec-packages/pull/23044)).
- **`sendMessagesAs` cross-contract utility-call sync** ([#23225](https://github.com/AztecProtocol/aztec-packages/pull/23225)): PXE now syncs the target contract before a cross-contract utility call.
- **Anchor-header threading** (cherry-pick of [#22679](https://github.com/AztecProtocol/aztec-packages/pull/22679)): Backport of anchor-header threading in PXE simulation paths.
- **Origin/contract address mismatch detected** ([#22637](https://github.com/AztecProtocol/aztec-packages/pull/22637)): PXE throws on origin/contract address mismatch during simulation rather than silently producing wrong results.
- **Race conditions in block-stream event handling** ([#22635](https://github.com/AztecProtocol/aztec-packages/pull/22635)): PXE now serializes block-stream event handling.
- **Private event store rollback** ([#22615](https://github.com/AztecProtocol/aztec-packages/pull/22615)): Guarded against in-flight jobs during rollback.
- **`setSenderForTags` scope correctness** ([#22672](https://github.com/AztecProtocol/aztec-packages/pull/22672)): Restricted to the current call (F-564).
- **`registerSender` wipe race** ([#22623](https://github.com/AztecProtocol/aztec-packages/pull/22623)): Wipes are now queued to avoid racing in-flight jobs.
- **`aztec-up` PATH leak** ([#22709](https://github.com/AztecProtocol/aztec-packages/pull/22709)): Bundled binaries no longer leak `node_modules/.bin` onto `PATH`.
- **ABI argument-encoder validation** ([#22529](https://github.com/AztecProtocol/aztec-packages/pull/22529)): Missing ABI validation in argument encoder added.

Full list in [`CHANGELOG.md`](CHANGELOG.md).

---

## Upgrade notes

- The breaking changes above are documented under the `## 4.3.0-rc.1` section of `docs/docs-developers/docs/resources/migration_notes.md`.

---

## All Changes

See [`CHANGELOG.md`](CHANGELOG.md) for the complete list of 162 categorized commits (BREAKING / Features / Bug Fixes / Documentation / Miscellaneous).
