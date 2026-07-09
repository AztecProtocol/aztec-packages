# PXE Store Selection by Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace wipe-on-mismatch with store selection keyed on `(l1ChainId, rollupAddress, schemaVersion)` for both PXE storage backends, per the approved design in `docs/plans/2026-07-09-store-selection-by-identity-design.md`.

**Architecture:** A new identity-slug helper in `@aztec/kv-store` composes a discriminator string that both backends embed in the physical store location (sqlite-opfs: DB name + per-store OPFS pool directory; lmdb-v2: subdirectory, behind an opt-in flag). Opening a store selects the matching physical store — reuse if it exists, create empty if not. No code path ever clears a populated store; residual version markers become throw-on-mismatch invariant checks.

**Tech Stack:** TypeScript monorepo (`yarn-project`), vitest (kv-store: node + playwright-browser projects), jest (stdlib), sqlite-wasm OPFS SAH pool, LMDB.

## Global Constraints

- Working directory for all commands is `yarn-project` (the Bash tool already runs there — never `cd`).
- Base branch: `merge-train/spartan`; working branch: `martin/change-store-version-behavior` (already checked out).
- Conventional commits; PR squashes on merge; no `Co-Authored-By: Claude` trailers; `git add` must name specific files (never `-u`, `-A`, or `.`).
- Line width 120 chars everywhere including comments. A post-edit hook runs the formatter.
- **Never wipe:** no new or modified code path may call `store.clear()` or delete/reset a directory that could contain user data. First-boot reset of a freshly created empty directory is the only allowed reset.
- New identity slug format (fixed by design, tasks must agree): `<l1ChainId>-<rollupAddress lowercase 0x-hex>-v<schemaVersion>`, defaults `0`, `EthAddress.ZERO`, `0`. Effective store name: `<name>_<slug>`. OPFS pool directory: `.aztec-kv-<effectiveName>`.
- Test commands:
  - kv-store node project: `yarn workspace @aztec/kv-store test:node <path>`
  - kv-store browser project: `yarn workspace @aztec/kv-store test:browser` (full suite; per-file filtering is not supported by the wrapper script)
  - stdlib (jest): `yarn workspace @aztec/stdlib test src/database-version/version_manager.test.ts`
- kv-store vitest browser tests stub `@aztec/foundation/eth-address` and `buffer` (see `kv-store/vitest.config.ts` aliases) — the stubs already support `toString()`, `random()`, `ZERO`, and `schema`, which is all the new code uses.
- Long test output: redirect to a file under `/tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/` and inspect with Read/Grep.

---

### Task 1: Identity slug helper + `DataStoreConfig.l1ChainId`

**Files:**
- Create: `yarn-project/kv-store/src/store_identity.ts`
- Create: `yarn-project/kv-store/src/store_identity.test.ts`
- Modify: `yarn-project/stdlib/src/kv-store/config.ts`
- Modify: `yarn-project/kv-store/vitest.config.ts` (node-project include list)
- Modify: `yarn-project/kv-store/src/sqlite-opfs/index.ts`, `yarn-project/kv-store/src/lmdb-v2/index.ts` (re-exports)

**Interfaces:**
- Consumes: `EthAddress` from `@aztec/foundation/eth-address`.
- Produces (used by Tasks 3–7):
  - `type StoreIdentity = { l1ChainId?: number; rollupAddress?: EthAddress; schemaVersion?: number }`
  - `storeIdentitySlug(identity: StoreIdentity): string`
  - `effectiveStoreName(name: string, identity: StoreIdentity): string`
  - `class StoreIdentityMismatchError extends Error { storeName: string; expected: string; actual: string }`
  - `DataStoreConfig` gains optional `l1ChainId?: number`.

- [ ] **Step 1: Write the failing test**

Create `yarn-project/kv-store/src/store_identity.test.ts` (vitest globals are enabled — no test-fn imports):

```ts
import { EthAddress } from '@aztec/foundation/eth-address';

import { effectiveStoreName, storeIdentitySlug } from './store_identity.js';

describe('storeIdentitySlug', () => {
  it('composes chain id, rollup address and schema version', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(storeIdentitySlug({ l1ChainId: 31337, rollupAddress, schemaVersion: 12 })).toEqual(
      '31337-0x1234567890abcdef1234567890abcdef12345678-v12',
    );
  });

  it('defaults missing values to chain 0, zero address, schema 0', () => {
    expect(storeIdentitySlug({})).toEqual(`0-${EthAddress.ZERO.toString()}-v0`);
  });

  it('normalizes the rollup address to lowercase hex', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890ABCDEF1234567890ABCDEF12345678');
    expect(storeIdentitySlug({ rollupAddress, schemaVersion: 1 })).toEqual(
      `0-0x1234567890abcdef1234567890abcdef12345678-v1`,
    );
  });
});

describe('effectiveStoreName', () => {
  it('joins the logical name and the slug with an underscore', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(effectiveStoreName('pxe_data', { l1ChainId: 1, rollupAddress, schemaVersion: 2 })).toEqual(
      'pxe_data_1-0x1234567890abcdef1234567890abcdef12345678-v2',
    );
  });
});
```

Add the file to the node project's include list in `yarn-project/kv-store/vitest.config.ts`:

```ts
          include: [
            './src/*.test.ts',
            './src/lmdb/**/*.test.ts',
            './src/lmdb-v2/**/*.test.ts',
            './src/stores/**/*.test.ts',
            './src/interfaces/**/*.test.ts',
          ],
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @aztec/kv-store test:node src/store_identity.test.ts`
Expected: FAIL — cannot resolve `./store_identity.js`.

- [ ] **Step 3: Write the implementation**

Create `yarn-project/kv-store/src/store_identity.ts`:

```ts
import { EthAddress } from '@aztec/foundation/eth-address';

/** The coordinates that determine which physical store a logical store name maps to. */
export type StoreIdentity = {
  /** Chain ID of the L1 the rollup is deployed to. */
  l1ChainId?: number;
  /** Address of the rollup contract the store's data pertains to. */
  rollupAddress?: EthAddress;
  /** Schema version of the data held in the store. */
  schemaVersion?: number;
};

/**
 * Composes the store-name discriminator for a store identity. Two identities map to the same physical store iff
 * their slugs are equal, so the format must stay stable: `<l1ChainId>-<rollupAddress>-v<schemaVersion>`.
 */
export function storeIdentitySlug({ l1ChainId, rollupAddress, schemaVersion }: StoreIdentity): string {
  return `${l1ChainId ?? 0}-${(rollupAddress ?? EthAddress.ZERO).toString()}-v${schemaVersion ?? 0}`;
}

/** Composes the physical store name for a logical store name and identity. */
export function effectiveStoreName(name: string, identity: StoreIdentity): string {
  return `${name}_${storeIdentitySlug(identity)}`;
}

/**
 * Thrown when a store's recorded identity does not match the identity it was opened under. Since the identity is
 * part of the physical store name, this can only indicate a store-naming bug; the store is left untouched.
 */
export class StoreIdentityMismatchError extends Error {
  constructor(
    public readonly storeName: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Store '${storeName}' records identity ${actual} but was opened as ${expected}. ` +
        `Refusing to open; data was NOT modified.`,
    );
    this.name = 'StoreIdentityMismatchError';
  }
}
```

In `yarn-project/stdlib/src/kv-store/config.ts`, extend the type and mappings (mirrors `ChainConfig.l1ChainId`, same env var and default, so the duplicate key in `pxeConfigMappings` spreads is harmless):

```ts
export type DataStoreConfig = {
  dataDirectory?: string;
  dataStoreMapSizeKb: number;
  l1ChainId?: number;
} & Partial<Pick<L1ContractAddresses, 'rollupAddress'>>;
```

and inside `dataConfigMappings`:

```ts
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    ...numberConfigHelper(31337),
    description: 'The chain ID of the ethereum host.',
  },
```

Re-export from both live backends. In `yarn-project/kv-store/src/sqlite-opfs/index.ts` and `yarn-project/kv-store/src/lmdb-v2/index.ts` add:

```ts
export { StoreIdentityMismatchError, effectiveStoreName, storeIdentitySlug } from '../store_identity.js';
export type { StoreIdentity } from '../store_identity.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @aztec/kv-store test:node src/store_identity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Build and commit**

```bash
yarn build
git add kv-store/src/store_identity.ts kv-store/src/store_identity.test.ts kv-store/vitest.config.ts \
  kv-store/src/sqlite-opfs/index.ts kv-store/src/lmdb-v2/index.ts stdlib/src/kv-store/config.ts
git commit -m "feat(kv-store): store identity slug helper and DataStoreConfig.l1ChainId"
```

(Paths in `git add` are relative to the CWD, which is `yarn-project`.)

---

### Task 2: `DatabaseVersionManager` — rollup mismatch honors `'throw'`

**Files:**
- Modify: `yarn-project/stdlib/src/database-version/version_manager.ts:199-208`
- Test: `yarn-project/stdlib/src/database-version/version_manager.test.ts`

**Interfaces:**
- Consumes: existing `DatabaseVersionManager`, `SchemaVersionMismatchPolicy`.
- Produces: under `schemaVersionMismatchPolicy: 'throw'`, a rollup-address mismatch against a **successfully parsed** version file throws instead of resetting. First boot (ENOENT) and read-failure paths are unchanged (read failure keeps its own `versionFileReadFailurePolicy`).

- [ ] **Step 1: Write the failing tests**

In `yarn-project/stdlib/src/database-version/version_manager.test.ts`, inside `describe('resets the database', ...)`, after the `'when the rollup address changes'` test (line ~142), add (uses the file's existing `fs`, `createManager`, `currentVersion`, `openSpy`, `expectVersionFileWritten` fixtures):

```ts
      it('unless rollup mismatches are configured to throw', async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion, EthAddress.random()).toBuffer());
        versionManager = createManager({ schemaVersionMismatchPolicy: 'throw' });
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow(/stored rollup address/);
        expect(fs.rm).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
      });

      it("still opens fresh on first boot when policy is 'throw' (no version file, different rollup)", async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        versionManager = createManager({ schemaVersionMismatchPolicy: 'throw', onUpgrade: undefined });
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(openSpy).toHaveBeenCalled();
      });
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `yarn workspace @aztec/stdlib test src/database-version/version_manager.test.ts`
Expected: `unless rollup mismatches are configured to throw` FAILS (open resolves, resets instead of throwing). The first-boot test may already pass — that is fine; it pins behavior we must not break.

- [ ] **Step 3: Implement**

In `yarn-project/stdlib/src/database-version/version_manager.ts`, track whether a version file was successfully parsed. In `open()`, next to the existing `shouldLogDataReset` declaration (line ~140), add:

```ts
    // Distinguishes "a version file existed and parsed" from first boot / unreadable file: only a parsed
    // version file can prove a genuine rollup mismatch, which is what the 'throw' policy protects against.
    let versionFileParsed = false;
```

Set it right after the successful parse in the `try` block (line ~144):

```ts
      const versionBuf = await this.fileSystem.readFile(this.versionFile);
      storedVersion = DatabaseVersion.fromBuffer(versionBuf);
      versionFileParsed = true;
```

Replace the rollup-mismatch `else` branch (lines ~199-208) with:

```ts
    } else {
      if (versionFileParsed && this.schemaVersionMismatchPolicy === 'throw') {
        throw new Error(
          `Cannot open database at ${this.dataDirectory}: stored rollup address ` +
            `${storedVersion.rollupAddress} does not match expected ${this.currentVersion.rollupAddress}`,
        );
      }
      if (shouldLogDataReset) {
        this.log.warn('Rollup address has changed, resetting data directory', {
          versionFile: this.versionFile,
          storedVersion,
          currentVersion: this.currentVersion,
        });
      }
      needsReset = true;
    }
```

Also update the `SchemaVersionMismatchPolicy` JSDoc in the same file (the `@param schemaVersionMismatchPolicy` line in the constructor doc, line ~64) to:

```ts
   * @param schemaVersionMismatchPolicy - Whether schema or rollup-address mismatches against an existing version
   *   file should reset data or throw
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `yarn workspace @aztec/stdlib test src/database-version/version_manager.test.ts`
Expected: PASS, including all pre-existing tests (the default-'reset' rollup test at line ~137 must still pass).

- [ ] **Step 5: Commit**

```bash
git add stdlib/src/database-version/version_manager.ts stdlib/src/database-version/version_manager.test.ts
git commit -m "fix(stdlib): honor 'throw' mismatch policy on rollup address change"
```

---

### Task 3: sqlite-opfs `createStore` selects by identity (core red/green)

**Files:**
- Modify: `yarn-project/kv-store/src/sqlite-opfs/index.ts`
- Create: `yarn-project/kv-store/src/sqlite-opfs/manage.ts` (pool-directory naming only in this task; list/delete come in Task 4)
- Test: `yarn-project/kv-store/src/sqlite-opfs/create_store.test.ts`

**Interfaces:**
- Consumes: `storeIdentitySlug`, `effectiveStoreName`, `StoreIdentityMismatchError` (Task 1); `DatabaseVersion` from `@aztec/stdlib/database-version/version`; `AztecSQLiteOPFSStore.open(log, name?, ephemeral?, poolDirectory?, encryptionKey?)`.
- Produces: `createStore(name, config, schemaVersion?, log?)` with unchanged signature but select-by-identity semantics; `storePoolDirectory(effectiveName: string): string` and `OPFS_POOL_DIR_PREFIX = '.aztec-kv-'` from `manage.ts`.

**Why per-store pool directories:** sqlite-wasm documents that only one SAH-pool VFS instance may use a directory concurrently, and pool capacity (`initialCapacity: 8`) does not auto-grow. One pool directory per store gives every store its own worker-owned pool (no cross-store lock contention, no slot exhaustion from orphaned stores) and makes delete = remove one OPFS directory.

- [ ] **Step 1: Write the failing test (data survives a rollup switch)**

Create `yarn-project/kv-store/src/sqlite-opfs/create_store.test.ts`:

```ts
import { EthAddress } from '@aztec/foundation/eth-address';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { mockLogger } from '../interfaces/utils.js';
import { createStore } from './index.js';

const configFor = (rollupAddress: EthAddress, l1ChainId = 31337): DataStoreConfig => ({
  dataDirectory: 'test',
  dataStoreMapSizeKb: 1024,
  rollupAddress,
  l1ChainId,
});

describe('sqlite-opfs createStore', () => {
  it('keeps data intact when switching rollup addresses back and forth', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();

    const storeA = await createStore('roundtrip_test', configFor(addrA), 1, mockLogger);
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('roundtrip_test', configFor(addrB), 1, mockLogger);
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.openSingleton<string>('payload').set('data-for-B');
    await storeB.close();

    const reopenedA = await createStore('roundtrip_test', configFor(addrA), 1, mockLogger);
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toEqual('data-for-A');
    await reopenedA.close();

    const reopenedB = await createStore('roundtrip_test', configFor(addrB), 1, mockLogger);
    expect(await reopenedB.openSingleton<string>('payload').getAsync()).toEqual('data-for-B');
    await reopenedB.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @aztec/kv-store test:browser > /tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/browser-red.log 2>&1`, then Grep the log for `roundtrip_test|create_store`.
Expected: the new test FAILS — today both opens hit the same physical store and `initStoreForRollupAndSchemaVersion` wipes it on the address change, so `reopenedA` reads `undefined`. All pre-existing browser tests must still pass.

- [ ] **Step 3: Implement**

Create `yarn-project/kv-store/src/sqlite-opfs/manage.ts`:

```ts
/** Prefix for the per-store OPFS SAH pool directories owned by this package. */
export const OPFS_POOL_DIR_PREFIX = '.aztec-kv-';

/**
 * OPFS directory holding a store's SAH pool. One directory per store: the SAH-pool VFS allows only one
 * concurrent instance per directory and its capacity does not grow automatically, so sharing a pool across
 * stores would make concurrently opened stores contend for locks and orphaned stores exhaust pool slots.
 */
export function storePoolDirectory(effectiveName: string): string {
  return `${OPFS_POOL_DIR_PREFIX}${effectiveName}`;
}
```

Rewrite `createStore` in `yarn-project/kv-store/src/sqlite-opfs/index.ts` (replacing the `initStoreForRollupAndSchemaVersion` import and call):

```ts
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DatabaseVersion } from '@aztec/stdlib/database-version/version';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { StoreIdentityMismatchError, effectiveStoreName } from '../store_identity.js';
import { storePoolDirectory } from './manage.js';
import { AztecSQLiteOPFSStore } from './store.js';

export { AztecSQLiteOPFSStore } from './store.js';
export { SqliteEncryptionError } from './errors.js';
export type { SqliteEncryptionErrorCode } from './errors.js';
export { OPFS_POOL_DIR_PREFIX, storePoolDirectory } from './manage.js';
export { StoreIdentityMismatchError, effectiveStoreName, storeIdentitySlug } from '../store_identity.js';
export type { StoreIdentity } from '../store_identity.js';

/**
 * Opens the persistent store selected by `name` and the identity `(config.l1ChainId, config.rollupAddress,
 * schemaVersion)`. A store exists per identity: reopening with the same identity returns the same data, a
 * different identity selects a different (possibly fresh) store. Nothing is ever cleared.
 */
export async function createStore(
  name: string,
  config: DataStoreConfig,
  schemaVersion: number | undefined = undefined,
  log: Logger = createLogger('kv-store'),
) {
  const storeName = effectiveStoreName(name, {
    l1ChainId: config.l1ChainId,
    rollupAddress: config.rollupAddress,
    schemaVersion,
  });
  log.info(`Creating ${storeName} SQLite-OPFS data store with map size ${config.dataStoreMapSizeKb} KB`);
  const store = await AztecSQLiteOPFSStore.open(
    createLogger('kv-store:sqlite-opfs'),
    storeName,
    false,
    storePoolDirectory(storeName),
  );
  try {
    await assertStoreIdentity(store, storeName, schemaVersion, config.rollupAddress);
  } catch (err) {
    // The store handle owns a worker and OPFS locks; release them before surfacing the refusal.
    await store.close().catch(() => {});
    throw err;
  }
  return store;
}

/**
 * Belt-and-braces invariant check: the identity is part of the physical store name, so the recorded version
 * can only disagree if there is a store-naming bug. Refuses to open on mismatch; never clears.
 */
async function assertStoreIdentity(
  store: AztecSQLiteOPFSStore,
  storeName: string,
  schemaVersion: number | undefined,
  rollupAddress: EthAddress | undefined,
): Promise<void> {
  const expected = new DatabaseVersion(schemaVersion ?? 0, rollupAddress ?? EthAddress.ZERO);
  const singleton = store.openSingleton<string>('dbVersion');
  const stored = await singleton.getAsync();
  if (stored === undefined) {
    await singleton.set(expected.toBuffer().toString('utf-8'));
    return;
  }
  let storedVersion: DatabaseVersion;
  try {
    storedVersion = DatabaseVersion.fromBuffer(Buffer.from(stored, 'utf-8'));
  } catch {
    throw new StoreIdentityMismatchError(storeName, expected.toString(), stored);
  }
  if (!storedVersion.equals(expected)) {
    throw new StoreIdentityMismatchError(storeName, expected.toString(), storedVersion.toString());
  }
}
```

Keep `openTmpStore` and `openEncryptedStore` exactly as they are.

- [ ] **Step 4: Add the isolation, concurrency, and mismatch tests**

Append to `create_store.test.ts` inside the `describe` block:

```ts
  it('opens two different stores concurrently in the same tab', async () => {
    const addr = EthAddress.random();
    const pxeStore = await createStore('pxe_data', configFor(addr), 1, mockLogger);
    const walletStore = await createStore('wallet_data', configFor(addr), 1, mockLogger);

    await pxeStore.openSingleton<string>('k').set('pxe');
    await walletStore.openSingleton<string>('k').set('wallet');
    expect(await pxeStore.openSingleton<string>('k').getAsync()).toEqual('pxe');
    expect(await walletStore.openSingleton<string>('k').getAsync()).toEqual('wallet');

    await pxeStore.close();
    await walletStore.close();
  });

  it('separates stores by schema version', async () => {
    const addr = EthAddress.random();
    const v1 = await createStore('schema_test', configFor(addr), 1, mockLogger);
    await v1.openSingleton<string>('k').set('v1-data');
    await v1.close();

    const v2 = await createStore('schema_test', configFor(addr), 2, mockLogger);
    expect(await v2.openSingleton<string>('k').getAsync()).toBeUndefined();
    await v2.close();

    const v1Again = await createStore('schema_test', configFor(addr), 1, mockLogger);
    expect(await v1Again.openSingleton<string>('k').getAsync()).toEqual('v1-data');
    await v1Again.close();
  });

  it('refuses to open on a recorded-identity mismatch and leaves data untouched', async () => {
    const addr = EthAddress.random();
    const store = await createStore('mismatch_test', configFor(addr), 1, mockLogger);
    await store.openSingleton<string>('payload').set('precious');
    // Simulate a naming bug by corrupting the recorded identity.
    await store.openSingleton<string>('dbVersion').set('garbage');
    await store.close();

    await expect(createStore('mismatch_test', configFor(addr), 1, mockLogger)).rejects.toThrow(
      StoreIdentityMismatchError,
    );

    // The refusal must not have modified the store: read it raw, bypassing the identity check.
    const storeName = effectiveStoreName('mismatch_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });
    const raw = await AztecSQLiteOPFSStore.open(mockLogger, storeName, false, storePoolDirectory(storeName));
    expect(await raw.openSingleton<string>('payload').getAsync()).toEqual('precious');
    await raw.close();
  });
```

and extend the imports at the top of the test file:

```ts
import { AztecSQLiteOPFSStore, StoreIdentityMismatchError, createStore, effectiveStoreName } from './index.js';
import { storePoolDirectory } from './manage.js';
```

(drop the now-redundant `import { createStore } from './index.js';` line).

- [ ] **Step 5: Run the browser suite to verify green**

Run: `yarn workspace @aztec/kv-store test:browser > /tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/browser-green.log 2>&1`, then Grep for failures.
Expected: ALL browser tests pass, including the four new ones and every pre-existing sqlite-opfs test (`encrypted_store.test.ts` in particular — it uses `AztecSQLiteOPFSStore.open` directly and must be unaffected).

- [ ] **Step 6: Commit**

```bash
git add kv-store/src/sqlite-opfs/index.ts kv-store/src/sqlite-opfs/manage.ts \
  kv-store/src/sqlite-opfs/create_store.test.ts
git commit -m "feat(kv-store): sqlite-opfs stores selected by (chain, rollup, schema) identity instead of wiped"
```

---

### Task 4: sqlite-opfs `listStores` / `deleteStore`

**Files:**
- Modify: `yarn-project/kv-store/src/sqlite-opfs/manage.ts`
- Modify: `yarn-project/kv-store/src/sqlite-opfs/index.ts` (re-export)
- Test: `yarn-project/kv-store/src/sqlite-opfs/create_store.test.ts` (append)

**Interfaces:**
- Consumes: `OPFS_POOL_DIR_PREFIX`, `storePoolDirectory` (Task 3), OPFS `navigator.storage.getDirectory()`.
- Produces: `listStores(): Promise<string[]>` (effective store names, slug included) and `deleteStore(effectiveName: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `create_store.test.ts`:

```ts
  it('lists created stores and deletes them', async () => {
    const addr = EthAddress.random();
    const store = await createStore('managed_test', configFor(addr), 1, mockLogger);
    await store.openSingleton<string>('k').set('v');
    await store.close();

    const storeName = effectiveStoreName('managed_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });
    expect(await listStores()).toContain(storeName);

    await deleteStore(storeName);
    expect(await listStores()).not.toContain(storeName);

    // Recreating after deletion starts empty.
    const fresh = await createStore('managed_test', configFor(addr), 1, mockLogger);
    expect(await fresh.openSingleton<string>('k').getAsync()).toBeUndefined();
    await fresh.close();
  });

  it('refuses to delete a store that is currently open', async () => {
    const addr = EthAddress.random();
    const store = await createStore('locked_test', configFor(addr), 1, mockLogger);
    const storeName = effectiveStoreName('locked_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });

    await expect(deleteStore(storeName)).rejects.toThrow();

    await store.close();
    await deleteStore(storeName);
  });
```

and add `listStores`, `deleteStore` to the `./manage.js` import in the test file.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `yarn workspace @aztec/kv-store test:browser > /tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/browser-manage-red.log 2>&1`
Expected: FAIL — `listStores` / `deleteStore` do not exist.

- [ ] **Step 3: Implement**

Append to `yarn-project/kv-store/src/sqlite-opfs/manage.ts`:

```ts
/**
 * Lists the effective names (logical name + identity slug) of every persistent sqlite-opfs store in this
 * origin, by enumerating the per-store pool directories. Includes stores created under identities other than
 * the current one — that is the point: wallets can surface and clean up data for networks no longer in use.
 */
export async function listStores(): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const [entryName, handle] of root.entries()) {
    if (handle.kind === 'directory' && entryName.startsWith(OPFS_POOL_DIR_PREFIX)) {
      names.push(entryName.slice(OPFS_POOL_DIR_PREFIX.length));
    }
  }
  return names;
}

/**
 * Permanently deletes a store by effective name (as returned by {@link listStores}). The store must be closed:
 * an open store's SAH pool holds locks on the directory and the removal will reject.
 */
export async function deleteStore(effectiveName: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(storePoolDirectory(effectiveName), { recursive: true });
}
```

Re-export from `yarn-project/kv-store/src/sqlite-opfs/index.ts`:

```ts
export { OPFS_POOL_DIR_PREFIX, deleteStore, listStores, storePoolDirectory } from './manage.js';
```

If `tsc` reports that `FileSystemDirectoryHandle.entries()` does not exist, add `"dom.asynciterable"` to the `lib` array in `yarn-project/tsconfig.json` (currently `["dom", "esnext", "es2017.object"]`) rather than casting.

- [ ] **Step 4: Run to verify green**

Run: `yarn workspace @aztec/kv-store test:browser > /tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/browser-manage-green.log 2>&1`
Expected: ALL pass. If `refuses to delete a store that is currently open` fails because Chromium allows the removal, delete that test case and the "must be closed" sentence stays in the JSDoc as documentation only — do not weaken `deleteStore` itself.

- [ ] **Step 5: Commit**

```bash
git add kv-store/src/sqlite-opfs/manage.ts kv-store/src/sqlite-opfs/index.ts \
  kv-store/src/sqlite-opfs/create_store.test.ts
git commit -m "feat(kv-store): list and delete sqlite-opfs stores"
```

---

### Task 5: lmdb-v2 `partitionByIdentity`

**Files:**
- Modify: `yarn-project/kv-store/src/lmdb-v2/factory.ts`
- Test: `yarn-project/kv-store/src/lmdb-v2/factory.test.ts` (new)

**Interfaces:**
- Consumes: `storeIdentitySlug` (Task 1), `DatabaseVersionManager` with the Task 2 fix.
- Produces: `CreateStoreOptions.partitionByIdentity?: boolean`. When true, the store directory is `join(dataDirectory, name, storeIdentitySlug(identity))` and both version-manager policies are forced to `'throw'`. When absent/false, behavior is byte-for-byte today's.

- [ ] **Step 1: Write the failing tests**

Create `yarn-project/kv-store/src/lmdb-v2/factory.test.ts` (node project — already covered by the `./src/lmdb-v2/**/*.test.ts` include):

```ts
import { EthAddress } from '@aztec/foundation/eth-address';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStore } from './factory.js';

describe('lmdb-v2 createStore', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'factory-test-'));
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const configFor = (rollupAddress: EthAddress, l1ChainId = 31337): DataStoreConfig => ({
    dataDirectory,
    dataStoreMapSizeKb: 10 * 1024,
    rollupAddress,
    l1ChainId,
  });

  it('with partitionByIdentity, keeps data intact when switching rollup addresses back and forth', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();
    const options = { partitionByIdentity: true };

    const storeA = await createStore('test_store', 1, configFor(addrA), undefined, options);
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('test_store', 1, configFor(addrB), undefined, options);
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.close();

    const reopenedA = await createStore('test_store', 1, configFor(addrA), undefined, options);
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toEqual('data-for-A');
    await reopenedA.close();
  });

  it('with partitionByIdentity, separates stores by schema version', async () => {
    const addr = EthAddress.random();
    const options = { partitionByIdentity: true };

    const v1 = await createStore('test_store', 1, configFor(addr), undefined, options);
    await v1.openSingleton<string>('k').set('v1-data');
    await v1.close();

    const v2 = await createStore('test_store', 2, configFor(addr), undefined, options);
    expect(await v2.openSingleton<string>('k').getAsync()).toBeUndefined();
    await v2.close();

    const v1Again = await createStore('test_store', 1, configFor(addr), undefined, options);
    expect(await v1Again.openSingleton<string>('k').getAsync()).toEqual('v1-data');
    await v1Again.close();
  });

  it('without the flag, keeps the historical reset-on-rollup-change behavior', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();

    const storeA = await createStore('test_store', 1, configFor(addrA));
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('test_store', 1, configFor(addrB));
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.close();

    // Historical behavior is destructive: the data does not come back.
    const reopenedA = await createStore('test_store', 1, configFor(addrA));
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await reopenedA.close();
  });
});
```

- [ ] **Step 2: Run to verify the identity tests fail**

Run: `yarn workspace @aztec/kv-store test:node src/lmdb-v2/factory.test.ts`
Expected: the two `partitionByIdentity` tests FAIL (the option is unknown/ignored, so the reset wipes `data-for-A`); the historical-behavior test PASSES.

- [ ] **Step 3: Implement**

In `yarn-project/kv-store/src/lmdb-v2/factory.ts`, extend the options type:

```ts
/** Optional versioning hooks for persistent LMDB stores. */
export type CreateStoreOptions = {
  onUpgrade?: (dataDir: string, currentVersion: number, latestVersion: number) => Promise<void>;
  schemaVersionMismatchPolicy?: SchemaVersionMismatchPolicy;
  versionFileReadFailurePolicy?: VersionFileReadFailurePolicy;
  /**
   * When true, the store directory is keyed by (l1ChainId, rollupAddress, schemaVersion): a different identity
   * selects a different directory instead of resetting this one, so no identity change is ever destructive.
   * The version file becomes a pure invariant check (any mismatch throws).
   */
  partitionByIdentity?: boolean;
};
```

and change the persistent branch of `createStore` (currently `const subDir = join(dataDirectory, name);` and the `DatabaseVersionManager` construction):

```ts
    const rollupAddress = rollupFromConfig ?? EthAddress.ZERO;
    const subDir = options.partitionByIdentity
      ? join(dataDirectory, name, storeIdentitySlug({ l1ChainId: config.l1ChainId, rollupAddress, schemaVersion }))
      : join(dataDirectory, name);
    await mkdir(subDir, { recursive: true });

    const versionManager = new DatabaseVersionManager({
      schemaVersion,
      rollupAddress,
      dataDirectory: subDir,
      onOpen: dbDirectory =>
        AztecLMDBStoreV2.new(dbDirectory, config.dataStoreMapSizeKb, MAX_READERS, () => Promise.resolve(), bindings),
      onUpgrade: options.onUpgrade,
      schemaVersionMismatchPolicy: options.partitionByIdentity ? 'throw' : options.schemaVersionMismatchPolicy,
      versionFileReadFailurePolicy: options.partitionByIdentity ? 'throw' : options.versionFileReadFailurePolicy,
    });
```

with the import added at the top:

```ts
import { storeIdentitySlug } from '../store_identity.js';
```

(Note the original code computed `rollupAddress` after `mkdir`; it moves above `subDir` because the slug needs it.)

- [ ] **Step 4: Run to verify green**

Run: `yarn workspace @aztec/kv-store test:node src/lmdb-v2/factory.test.ts`
Expected: all 3 PASS. Then run the whole node project to guard against regressions: `yarn workspace @aztec/kv-store test:node`.

- [ ] **Step 5: Commit**

```bash
git add kv-store/src/lmdb-v2/factory.ts kv-store/src/lmdb-v2/factory.test.ts
git commit -m "feat(kv-store): opt-in identity-partitioned lmdb-v2 stores"
```

---

### Task 6: Wire up the Node.js PXE and node embedded wallet

**Files:**
- Modify: `yarn-project/pxe/src/entrypoints/server/utils.ts:49-54`
- Modify: `yarn-project/wallets/src/embedded/entrypoints/node.ts:31,40,71-87`

**Interfaces:**
- Consumes: `createStore(name, schemaVersion, config, bindings, { partitionByIdentity: true })` from `@aztec/kv-store/lmdb-v2` (Task 5).
- Produces: no new interfaces; behavior change only.

- [ ] **Step 1: Server PXE passes the flag**

In `yarn-project/pxe/src/entrypoints/server/utils.ts`, the store creation becomes:

```ts
    options.store = await createStore(
      'pxe_data',
      PXE_DATA_SCHEMA_VERSION,
      configWithContracts,
      storeLogger.getBindings(),
      { partitionByIdentity: true },
    );
```

(`configWithContracts` already carries `l1ChainId` and `rollupAddress` from `getNodeInfo()`.)

- [ ] **Step 2: Node embedded wallet drops hand-rolled suffixes**

In `yarn-project/wallets/src/embedded/entrypoints/node.ts`, keep the existing `aztecNode` variable and replace the
`getL1ContractAddresses` call (line ~31) so the two lines read:

```ts
    const aztecNode = typeof nodeOrUrl === 'string' ? createAztecNodeClient(nodeOrUrl) : nodeOrUrl;
    const { l1ChainId, l1ContractAddresses } = await aztecNode.getNodeInfo();
```

Change the PXE config default directory (line ~40) from `` dataDirectory: `pxe_data_${l1Contracts.rollupAddress}` `` to:

```ts
      dataDirectory: 'aztec-wallet-data',
```

Change the walletDB store creation (lines ~68-87) to:

```ts
    const walletDBStore =
      options.walletDb?.store ??
      (options.ephemeral
        ? await openTmpStore(
            'wallet_data',
            true,
            undefined,
            undefined,
            rootLogger.createChild('wallet:data').getBindings(),
          )
        : await createStore(
            'wallet_data',
            1,
            {
              dataDirectory: pxeConfig.dataDirectory ?? 'aztec-wallet-data',
              dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
              rollupAddress: l1ContractAddresses.rollupAddress,
              l1ChainId,
            },
            rootLogger.createChild('wallet:data').getBindings(),
            { partitionByIdentity: true },
          ));
```

There are no other `l1Contracts` references in the file after these edits (verify with Grep; the pre-change references are lines 31, 40, 72, 82, 84).

- [ ] **Step 3: Build and run affected tests**

```bash
yarn build
yarn workspace @aztec/pxe test
```

Expected: build clean; pxe unit tests pass (they mock `getNodeInfo` already). If any wallets tests exist that construct `NodeEmbeddedWallet`, run `yarn workspace @aztec/wallets test` as well and fix fallout — the likely failure mode is a missing `getNodeInfo` mock where only `getL1ContractAddresses` was mocked; extend the mock with `getNodeInfo` returning `{ l1ChainId: 31337, l1ContractAddresses: { rollupAddress }, rollupVersion: 1 }` shaped like `stdlib`'s `NodeInfo`.

- [ ] **Step 4: Commit**

```bash
git add pxe/src/entrypoints/server/utils.ts wallets/src/embedded/entrypoints/node.ts
git commit -m "feat(pxe): node PXE and embedded wallet stores partitioned by identity"
```

---

### Task 7: Wire up the browser PXE and browser embedded wallet

**Files:**
- Modify: `yarn-project/pxe/src/entrypoints/client/bundle/utils.ts:34-43`
- Modify: `yarn-project/pxe/src/entrypoints/client/lazy/utils.ts` (same edit; the files differ only in import specifiers)
- Modify: `yarn-project/wallets/src/embedded/entrypoints/browser.ts:30,39,71-80`

**Interfaces:**
- Consumes: sqlite-opfs `createStore` (Task 3) — no signature change, it now reads `config.l1ChainId`.
- Produces: no new interfaces; behavior change only.

- [ ] **Step 1: Browser createPXE fetches chain identity from the node**

In both `bundle/utils.ts` and `lazy/utils.ts`, replace:

```ts
  const l1ContractAddresses = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    ...l1ContractAddresses,
  } as PXEConfig;
```

with:

```ts
  const { l1ChainId, l1ContractAddresses, rollupVersion } = await aztecNode.getNodeInfo();
  const configWithContracts = {
    ...config,
    ...l1ContractAddresses,
    l1ChainId,
    rollupVersion,
  } as PXEConfig;
```

- [ ] **Step 2: Browser embedded wallet drops hand-rolled suffixes**

In `yarn-project/wallets/src/embedded/entrypoints/browser.ts`:

Replace line ~30:

```ts
    const { l1ChainId, l1ContractAddresses } = await aztecNode.getNodeInfo();
```

Replace the PXE config default directory (line ~39) with a plain marker (sqlite-opfs uses `dataDirectory` only to word its log line):

```ts
      dataDirectory: 'pxe_data',
```

Replace the walletDB store creation (lines ~67-80):

```ts
    const walletDBStore =
      options.walletDb?.store ??
      (options.ephemeral
        ? await openTmpStore(true)
        : await createStore(
            'wallet_data',
            {
              dataDirectory: 'wallet_data',
              dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
              rollupAddress: l1ContractAddresses.rollupAddress,
              l1ChainId,
            },
            1,
            rootLogger.createChild('wallet:data'),
          ));
```

Update any remaining `l1Contracts` references in the file (pre-change: lines 30, 39, 74, 76) to `l1ContractAddresses`.

- [ ] **Step 3: Build, lint, and sweep for stragglers**

```bash
yarn build
```

Then Grep the repo for `wallet_data_${` and `pxe_data_${` under `yarn-project` (excluding `dest/` and `node_modules/`) — expected: zero hits. Also Grep for remaining production imports of `initStoreForRollupAndSchemaVersion`: expected hits only in `kv-store/src/utils.ts` itself, `kv-store/src/lmdb/index.ts`, and `kv-store/src/deprecated/indexeddb/` (test-only backends, deliberately untouched).

- [ ] **Step 4: Commit**

```bash
git add pxe/src/entrypoints/client/bundle/utils.ts pxe/src/entrypoints/client/lazy/utils.ts \
  wallets/src/embedded/entrypoints/browser.ts
git commit -m "feat(pxe): browser PXE and embedded wallet stores partitioned by identity"
```

---

### Task 8: Full verification, changelog, docs

**Files:**
- Modify: changelog files as directed by the `updating-changelog` skill
- No other code changes expected

- [ ] **Step 1: Full build + format + lint**

```bash
yarn build
yarn format
yarn lint kv-store stdlib pxe wallets
```

Expected: all clean. Commit any formatter-only diffs with `chore: format`.

- [ ] **Step 2: Full test pass for touched packages**

```bash
yarn workspace @aztec/kv-store test:node
yarn workspace @aztec/kv-store test:browser > /tmp/claude-30077/-mnt-user-data-martin-aztec-packages-2/f4cd57d5-2cdb-4c77-8e2b-143b4559fd6e/scratchpad/browser-final.log 2>&1
yarn workspace @aztec/stdlib test src/database-version
yarn workspace @aztec/pxe test
yarn workspace @aztec/wallets test
```

Expected: all pass. Check `yarn-project/pxe/src/storage/backwards_compatibility_tests/` specifically — those tests open stores directly via tmp-store helpers and should be unaffected; if one constructs a store through `createStore`, it now gets an identity-slugged location, which is fine as long as the test is self-contained.

- [ ] **Step 3: Changelog**

Invoke the `updating-changelog` skill to document the behavior change:
- PXE/wallet stores are no longer wiped when the rollup address or schema version changes; a store now exists per `(l1ChainId, rollupAddress, schemaVersion)` and switching selects the matching store.
- First start after upgrading begins with a fresh (empty) store; previous data remains on disk under the old name and is not deleted.
- New `listStores()` / `deleteStore()` utilities in `@aztec/kv-store/sqlite-opfs` for wallet-driven cleanup.

- [ ] **Step 4: Final review and commit**

```bash
git log --oneline origin/merge-train/spartan..HEAD
git diff origin/merge-train/spartan...HEAD --stat
```

Confirm every commit is conventional and scoped. Commit the changelog updates:

```bash
git add <changelog files reported by the skill>
git commit -m "docs: changelog for identity-partitioned PXE stores"
```
