# PXE store selection by identity

**Date:** 2026-07-09
**Branch:** `martin/change-store-version-behavior`
**Status:** Approved design, pending implementation

## Problem

The PXE-backing stores are wiped whenever the rollup address or schema version recorded in the
store differs from what the node reports at startup:

- Browser (sqlite-opfs): `initStoreForRollupAndSchemaVersion` (`yarn-project/kv-store/src/utils.ts`)
  unconditionally calls `store.clear()` on any mismatch, then rewrites the `dbVersion` marker.
- Node.js (lmdb-v2): `DatabaseVersionManager` (`yarn-project/stdlib/src/database-version/version_manager.ts`)
  supports a `'reset' | 'throw'` policy for schema mismatches, but the rollup-address branch resets
  unconditionally regardless of policy.

The store handle is shared by `KeyStore` (`yarn-project/pxe/src/storage/open_pxe_stores.ts`), so the
wipe destroys the account master secret keys (`ivsk_m/ovsk_m/tsk_m/nhk_m`) along with notes,
contracts, and tagging state. The trigger is unauthenticated node-reported data
(`getL1ContractAddresses()` / `getNodeInfo()`), and no attacker is required: a testnet rollup
redeploy or switching between nodes on different rollups is enough. The wipe is also sticky —
after clearing, the marker is rewritten to the new identity, so reconnecting to the original node
wipes again.

The embedded wallet already *tries* to partition per rollup by passing
`dataDirectory: wallet_data_${rollupAddress}` / `pxe_data_${rollupAddress}`
(`yarn-project/wallets/src/embedded/entrypoints/browser.ts`), but sqlite-opfs keys stores on `name`
only and ignores `dataDirectory`, so the partitioning is a silent no-op in the browser.

History: version detection was introduced in PR #20007, which acknowledged wipe-on-mismatch as an
aggressive stopgap. An alternative proposal (add a `'throw'` refusal policy) handles the
round-trip case badly: every switch between two rollups raises an "erase your data?" decision, and
consenting destroys the other rollup's data.

## Decision

A store's identity is **`(l1ChainId, rollupAddress, schemaVersion)`**. Opening a store *selects*
the physical store matching that identity: if it exists, reuse it; if not, create it empty.
Nothing is ever cleared. "Mismatch" stops being expressible — a different identity is a different
store.

Scope decisions:

- **Both PXE paths**: browser sqlite-opfs and Node.js lmdb-v2 (server PXE, CLI wallets, sandbox).
- **Node infra untouched**: archiver/world-state/p2p keep `DatabaseVersionManager` reset semantics.
  Their data is public and resyncable; keeping per-rollup copies of 100GB+ stores is an operator
  cost decision out of scope here.
- **KeyStore split deferred**: keys remain inside the per-identity store. They are no longer
  destroyed on rollup change, only stranded per store (accounts appear empty on a new rollup until
  re-imported). Giving key material its own chain-agnostic store is a follow-up; this design keeps
  it possible (a future `keystore_data` store simply omits chain identity from its slug).

## Design

### Identity slug helper (new, in `kv-store`)

`storeIdentitySlug({ l1ChainId, rollupAddress, schemaVersion })` → e.g.
`31337-0x<full lowercase address>-v12`. Full address, no truncation. Shared by both backends and
exported so callers that hand-build store names (e.g. the encrypted embedded-store path, which
takes caller-provided names) can compose correctly. Missing values default as today:
`rollupAddress` → zero address, `l1ChainId` → 0.

### `DataStoreConfig`

Gains optional `l1ChainId` (`yarn-project/stdlib/src/kv-store/config.ts`).

### sqlite-opfs `createStore`

- Composes the effective DB name as `${name}_${slug}`.
- Stops calling `initStoreForRollupAndSchemaVersion` entirely.
- Still writes the `dbVersion` singleton on first open; a mismatch on reopen **throws** a typed
  `StoreIdentityMismatchError` — it can only mean a naming bug — and must never wipe.
- No opt-in flag: the only callers are PXE and the embedded wallet, both of which want the new
  behavior.

### lmdb-v2 `createStore`

- Gains an opt-in `CreateStoreOptions.partitionByIdentity`.
- When set: data dir becomes `join(dataDirectory, name, slug)` and `DatabaseVersionManager` runs
  with `schemaVersionMismatchPolicy: 'throw'` and `versionFileReadFailurePolicy: 'throw'` — the
  version file becomes a pure invariant check plus migration metadata.
- Default off: every node-infra caller is untouched.

### Callers

- Browser `createPXE` (bundle + lazy): switch `getL1ContractAddresses()` → `getNodeInfo()` to
  obtain `l1ChainId`, thread it into the store config.
- Server `createPXE`: already has `l1ChainId`; pass `partitionByIdentity: true`.
- Embedded wallet (browser + node entrypoints): drop the hand-rolled
  `wallet_data_${rollupAddress}` / `pxe_data_${rollupAddress}` dataDirectory suffixes; the
  partitioning now lives where it is enforced. The node entrypoint's `wallet_data` store passes
  `partitionByIdentity: true`; the browser entrypoint gets the behavior from sqlite-opfs
  `createStore` directly.

### Store management utilities (sqlite-opfs)

`listStores()` and `deleteStore(name)` exposed from the kv-store package. The worker already
implements `deleteDb`; listing comes from the SAH pool's file names. No auto-pruning — retention
policy belongs to the wallet UI, which can now show "you have data for N networks" and offer
cleanup.

### OPFS pool verification (implementation-time task, with a test)

Two facts must be established empirically before the sqlite-opfs work can be called done:

1. How `pxe_data` + `wallet_data` coexist today in the default pool directory
   (`.aztec-kv`), given the documented exclusive per-directory lock of the SAH pool.
2. Whether the pool grows past `initialCapacity: 8` — orphaned per-identity stores consume pool
   slots, so without growth, accumulation could make *new* store creation fail.

If capacity does not auto-grow, either handle `addCapacity` on open-failure or move to a
pool-directory-per-store layout. The design adapts here if forced; everything else is unaffected.

## Error handling

No path in the new code ever calls `store.clear()` or resets a directory. Failures are typed
throws: identity mismatch (naming bug), version-file unreadable (lmdb-v2 `'throw'` policy),
decryption failure (existing `SqliteEncryptionError`). The stickiness bug is structurally gone —
there is no marker to rewrite on any failure path.

## Migration & compatibility

- Existing `pxe_data` / `wallet_data` stores are orphaned in place, not adopted: a one-time
  "fresh store" experience identical to a schema bump, with old data left recoverable on disk.
- Changelog entry required (behavior change: stores are no longer wiped on rollup/schema change;
  first start after upgrade begins with an empty store).
- Future schema migrations become read-old-store → write-new-store — crash-safe by construction —
  but implementing migrations is explicitly out of scope.

## Security notes

- A malicious or misconfigured node can no longer destroy local data; at worst it directs the
  wallet at an empty namespace, and the real store is recovered by reconnecting to the right node.
- A malicious node can still mint unbounded empty stores (it controls the reported identity).
  Mitigated by list/delete utilities and the pool-capacity handling above; full rate-limiting is
  out of scope.

## Testing

Red/green:

1. Red: kv-store test reproducing today's wipe — open store, write, reopen with a different
   `rollupAddress`, observe data gone.
2. Green after the change: both stores coexist; original data intact under the original identity.

Plus:

- Slug composition unit tests (defaults, formatting stability).
- sqlite-opfs isolation-by-identity (browser test suite): write under identity A, open identity B
  (empty), reopen A (intact).
- lmdb-v2 flag off = today's reset behavior (regression guard for node infra); flag on =
  partitioned directories, no reset.
- `listStores` / `deleteStore` behavior.
- OPFS pool capacity/coexistence findings encoded as tests.
