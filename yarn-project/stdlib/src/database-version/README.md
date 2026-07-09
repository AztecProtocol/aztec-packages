# Version Manager

The Version Manager helps manage database migrations and version compatibility across different versions of the software.

## Features

- Track database schema versions
- Handle migrations between versions
- Reset database when necessary (incompatible versions, rollup address change)
- Simple, clean API for version management

## Usage

```typescript
import { version } from '@aztec/foundation';
import { EthAddress } from '@aztec/foundation/eth-address';

// Define your current database version
const DB_VERSION = 3;
const rollupAddress = EthAddress.fromString('0x1234567890123456789012345678901234567890');

// Create version manager for your service
const versionManager = new version.VersionManager(DB_VERSION, rollupAddress, {
  dataDir: '/path/to/data',
  serviceName: 'my-database',
});

// When initializing your database
await versionManager.checkVersionAndHandle(
  // Called when a reset is needed
  async () => {
    // Initialize a fresh database
    await initializeFreshDatabase();
  },
  // Called when an upgrade is needed (optional)
  async (oldVersion, newVersion) => {
    if (oldVersion === 1 && newVersion === 2) {
      // Migrate from version 1 to 2
      await migrateV1ToV2();
    } else if (oldVersion === 2 && newVersion === 3) {
      // Migrate from version 2 to 3
      await migrateV2ToV3();
    } else {
      // Unsupported migration path, will fall back to reset
      throw new Error(`Cannot upgrade from ${oldVersion} to ${newVersion}`);
    }
  },
);

// Get the data directory for your service
const dataDir = versionManager.getDataDirectory();
```

## Automatic Reset Conditions

The database is reset in the following conditions:

1. First boot: no version file exists yet.
2. The version file exists but cannot be read or parsed (permissions, IO error, truncation), unless
   `versionFileReadFailurePolicy: 'throw'` is set — then it refuses to open and leaves data untouched.
3. The stored schema version is incompatible with the current one and no upgrade path applies (no upgrade callback,
   or the callback throws), unless `schemaVersionMismatchPolicy: 'throw'` is set — then it refuses to open.
4. The stored rollup address differs from the current one, unless `rollupAddressMismatchPolicy: 'throw'` is set —
   then it refuses to open.

The `'throw'` policies only fire when a version file was successfully parsed: first boot always proceeds and never
throws. When a reset occurs, the data directory is deleted and recreated, and the reset callback is called to
initialize a fresh database.
