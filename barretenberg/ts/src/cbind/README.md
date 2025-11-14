# BBAPI Bindings and Logging

Derives bindings from the reported msgpack schema from bb.

## Directory Structure

- `schema_compiler.ts` - Compiler that generates TypeScript types and API classes from msgpack schema
- `generate.ts` - Script to fetch schema from bb binary and generate bindings
- `bbapi_log_shared.ts` - Shared logging infrastructure (platform-agnostic)
- `browser/bbapi_log.ts` - Browser-specific logging utilities
- `node/bbapi_log.ts` - Node.js-specific logging utilities
- `generated/` - Auto-generated API bindings (do not edit directly)
  - `api_types.ts` - Type definitions and serialization functions
  - `async.ts` - Async API class
  - `sync.ts` - Sync API class
  - `curve_constants.ts` - Curve constants

## BBAPI Call Logging

The BBAPI logging feature allows automatic capture of all BBAPI calls to msgpack files for debugging and replay purposes. This is particularly useful for:

- Debugging issues in production without needing full stack traces
- Capturing reproducible test cases from user reports
- Replaying failed operations across different BB versions
- Performance analysis and profiling

### How It Works

When enabled, the logging system automatically:
1. Captures every BBAPI call (the msgpack-encoded request buffer)
2. Stores it in memory during execution
3. Saves all captured calls to a file when the API is destroyed or explicitly flushed
4. Each log entry is size-prefixed (4-byte little-endian) for easy parsing

### Enabling BBAPI Logging

#### Browser Environment

**Option 1: localStorage**
```javascript
// Set in browser console or before loading your app
localStorage.setItem('BBAPI_DEBUG_LOG', 'true');
```

**Option 2: URL Query Parameter**
```
https://your-app.com/?bbapi_debug_log
```

When enabled in the browser, logs are automatically downloaded as a file when the API is destroyed.

#### Node.js Environment

Set the `BBAPI_DEBUG_LOG` environment variable to a directory path where logs should be saved:

```bash
# Save logs to current directory
export BBAPI_DEBUG_LOG=.
node your-app.js

# Save logs to specific directory
export BBAPI_DEBUG_LOG=/tmp/bbapi-logs
node your-app.js
```

Logs are saved as timestamped files: `bbapi-logs-YYYY-MM-DDTHH-MM-SS-sssZ.msgpack`

### Using the Logging API

The logging system is automatically initialized when the module loads, but you can also interact with it programmatically:

```typescript
import {
  isBbapiLoggingEnabled,
  flushBbapiLogs,
  getBbapiLogCount,
  clearBbapiLogs
} from './cbind/bbapi_log.js';

// Check if logging is enabled
if (isBbapiLoggingEnabled()) {
  console.log('BBAPI logging is active');
}

// Get number of captured calls
const callCount = getBbapiLogCount();
console.log(`Captured ${callCount} BBAPI calls`);

// Manually flush logs to file (also happens automatically on destroy)
flushBbapiLogs();

// Clear captured logs without saving
clearBbapiLogs();
```

### Log File Format

Log files are msgpack files containing size-prefixed entries:

```
[4 bytes: size1][size1 bytes: msgpack data 1]
[4 bytes: size2][size2 bytes: msgpack data 2]
...
```

Each msgpack entry contains the full BBAPI request in the format:
```javascript
[["CommandName", { command: "parameters" }]]
```

### Example: Replaying Captured Calls

```typescript
import { readFileSync } from 'fs';
import { Decoder } from 'msgpackr';

// Read log file
const buffer = readFileSync('bbapi-logs-2025-01-15T12-30-45-123Z.msgpack');
let offset = 0;

while (offset < buffer.length) {
  // Read 4-byte size prefix (little-endian)
  const size = buffer.readUInt32LE(offset);
  offset += 4;

  // Read msgpack data
  const msgpackData = buffer.subarray(offset, offset + size);
  offset += size;

  // Decode the request
  const decoder = new Decoder({ useRecords: false });
  const [commandName, commandData] = decoder.unpack(msgpackData)[0];

  console.log(`Command: ${commandName}`, commandData);

  // Replay the command
  // await api.backend.call(msgpackData);
}
```

## Generating Bindings

To regenerate the TypeScript bindings after updating the bb binary or schema:

```bash
# From barretenberg/ts directory
yarn generate
```

This will:
1. Execute `bb msgpack schema` to get the API schema
2. Generate TypeScript types and conversion functions
3. Generate async and sync API classes with logging support
4. Generate curve constants

## Development

When modifying the schema compiler or logging system:

1. Make changes to `schema_compiler.ts`, `bbapi_log*.ts`, or other source files
2. Run `yarn generate` to regenerate the API bindings
3. Test with both browser and Node.js environments
4. Verify logging works in both environments

### Testing Logging

**Automated Tests:**

The repository includes test scripts that can be run in CI or manually:

```bash
# From barretenberg/ts directory

# Test basic BBAPI logging (creates log file)
yarn test:bbapi-logging

# Test msgpack replay with bb binary
yarn test:bbapi-replay

# Parse and view log file contents
node parse_bbapi_logs.mjs /tmp/bbapi-test/bbapi-logs-*.msgpack
```

**Browser Tests:**

Browser BBAPI logging tests are in `yarn-project/ivc-integration/src/browser_bbapi_logging.test.ts`:

```bash
# From yarn-project/ivc-integration
yarn test:browser
```

These tests verify:
- localStorage and URL parameter initialization
- Msgpack file download
- Replay compatibility with `bb msgpack run`

**Manual Testing:**

**Browser:**
```javascript
// In browser console
localStorage.setItem('BBAPI_DEBUG_LOG', 'true');
// Reload page and perform operations
// Logs will download automatically
```

**Node.js:**
```bash
BBAPI_DEBUG_LOG=. node -e "
  import('./index.js').then(async ({ Barretenberg }) => {
    const api = await Barretenberg.new();
    // Perform some operations
    await api.destroy(); // Logs saved to ./bbapi-logs-*.msgpack
  });
"
```