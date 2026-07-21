---
title: Logging from Contracts
sidebar_position: 4
tags: [contracts, logging, debugging, aztec.nr]
description: Add log statements to your Aztec contracts and control log verbosity in tests and local networks.
---

Aztec contracts can emit log messages at seven severity levels. Private function logs appear immediately during local simulation in the Private eXecution Environment (PXE), while public function logs are collected and displayed in test mode.

## Prerequisites

- An Aztec contract project set up with the `aztec-nr` dependency
- Basic understanding of [private, public, and utility functions](./framework-description/functions/visibility.md)

## Import the logging functions

Logging functions live under `aztec::oracle::logging`. Import the specific functions you need:

#include_code logging_imports /docs/examples/contracts/logging_example/src/main.nr rust

Or import only what you need:

```rust
use aztec::oracle::logging::{info_log, debug_log, debug_log_format};
```

:::warning Old import path removed
The previous import path `dep::aztec::oracle::debug_log` has been removed. Update your imports to use `aztec::oracle::logging` instead.
:::

## Log levels

Aztec supports seven log levels, ordered from least to most verbose:

| Level | Value | When to use |
|---------|-------|-------------|
| `fatal` | 1 | Unrecoverable errors that should always be visible |
| `error` | 2 | Recoverable errors or unexpected conditions |
| `warn` | 3 | Potential issues worth investigating |
| `info` | 4 | General operational information |
| `verbose` | 5 | Detailed information for troubleshooting |
| `debug` | 6 | Development-time debugging output |
| `trace` | 7 | Fine-grained tracing of execution flow |

When you set `LOG_LEVEL=info`, you see `fatal`, `error`, `warn`, and `info` messages, but `verbose`, `debug`, and `trace` are hidden.

Here is an example using all seven levels:

#include_code log_all_levels /docs/examples/contracts/logging_example/src/main.nr rust

## Simple log messages

Each level has a function that accepts a plain string with no format arguments:

#include_code log_simple /docs/examples/contracts/logging_example/src/main.nr rust

## Log messages with format arguments

Each level also has a `_format` variant that accepts a format string and an array of `Field` values. Use `{0}`, `{1}`, etc. to insert individual arguments by index, or `{}` to print the entire array:

#include_code log_format_patterns /docs/examples/contracts/logging_example/src/main.nr rust

:::note
Format arguments must be `Field` values. Use `.to_field()` to convert addresses and other types:

#include_code log_address /docs/examples/contracts/logging_example/src/main.nr rust
:::

## Viewing logs

### In `aztec test` (Noir tests)

To see contract logs, set `LOG_LEVEL` to include the `debug_log` module:

```bash
LOG_LEVEL="error;trace:debug_log" aztec test
```

:::tip
Use different log levels strategically: add `info_log` calls for key state transitions you always want to see, and `debug_log` or `trace_log` calls for detailed inspection.
:::

### In TypeScript tests (jest, vitest)

TypeScript test environments do not enable contract logs by default. Set the `LOG_LEVEL` environment variable to include the `contract_log` module:

```bash
# Show contract logs at debug level and above
LOG_LEVEL="info;debug:contract_log" yarn test

# Show all contract log levels (most verbose)
LOG_LEVEL="error;trace:contract_log" yarn test
```

### With a local network

Contract logs appear in the process that runs the PXE — your test process, not the network process. The network window only shows system-level infrastructure logs (archiver, world-state, etc.), which are generally not useful for contract debugging.

When running TypeScript tests against a local network, set `LOG_LEVEL` on the **test command**:

```bash
# Your test process sees contract logs
LOG_LEVEL="error;trace:contract_log" yarn test
```

You do not need to change the `LOG_LEVEL` on `aztec start --local-network` to see contract logs.

## `LOG_LEVEL` syntax reference

The `LOG_LEVEL` environment variable uses a semicolon-delimited format:

```
<default_level>;<level>:<module1>,<module2>;<level>:<module3>
```

- **First segment (required)**: the default log level for all modules. A bare `level:module` with no preceding default (e.g. `LOG_LEVEL="warn:simulator"`) is invalid and throws `Invalid log level` — the parser always reads the segment before the first `;` as the default level. To filter only specific modules, start with `silent` (e.g. `LOG_LEVEL="silent;debug:simulator"`)
- **Remaining segments**: `level:module` pairs that override the default for specific modules
- Modules are comma-separated within a segment
- The `aztec:` prefix is automatically stripped from module names
- Module names support regex or prefix matching

### Common configurations

| Scenario | `LOG_LEVEL` value |
|----------|-------------------|
| Contract logs in `aztec test` (TXE) | `error;trace:debug_log` |
| Contract logs in TypeScript tests (PXE) | `error;trace:contract_log` |
| Contract debug+ logs with system info | `info;debug:contract_log` |
| Only contract warnings and errors | `warn;warn:contract_log` |
| Everything verbose | `verbose` |
| Debug a specific system module | `info;debug:sequencer` |
| Multiple module overrides | `warn;debug:sequencer,archiver;trace:contract_log` |

## How contract logs are displayed

### In `aztec test` (TXE)

Contract logs appear under the `debug_log` module:

```
[07:40:29.947] DEBUG: txe:top_level_context:debug_log your message here
```

### In TypeScript tests (PXE)

When running through the PXE, the output includes the contract name with an abbreviated address:

```
[07:40:29.937] INFO: contract_log::Counter(0x1234abcd) 164f9c87bca0cf8c Transfer completed
[07:40:29.947] DEBUG: contract_log::Counter(0x1234abcd) 164f9c87bca0cf8c Processing value: 0x2a
```

The hex value after the address (`164f9c87bca0cf8c`) is an internal request identifier. If the contract name cannot be resolved, you see `Unknown` in its place.

## Logging in public functions

Private and public functions handle logging differently:

- **Private functions** execute locally in the PXE. You see logs immediately during simulation.
- **Public functions** execute on the sequencer. You see logs during `.simulate()` calls and after `.send().wait()` completes in test mode.

The logging API is the same in public functions:

#include_code log_public /docs/examples/contracts/logging_example/src/main.nr rust

### Accessing logs programmatically

In test mode (when not using real proofs), you can access public function debug logs on the `TxReceipt`:

```typescript
import { applyStringFormatting } from '@aztec/foundation/log';

const { receipt } = await contract.methods.myPublicFunction(args).send({
  from: address,
  fee: { paymentMethod },
  wait: { timeout: 600 },
});

// Logs are automatically printed to your console.
// You can also access them programmatically:
if (receipt.debugLogs) {
  for (const log of receipt.debugLogs) {
    console.log(`[${log.level}] ${applyStringFormatting(log.message, log.fields)}`);
  }
}
```

Each entry contains:

- `contractAddress` - the contract that emitted the log
- `level` - the log level (`info`, `debug`, etc.)
- `message` - the unformatted message string
- `fields` - the raw `Field` values passed as arguments

:::warning
`receipt.debugLogs` is only available in test mode (when not using real proofs). In production, debug log collection is disabled.
:::

## Verify logging works

Add a `debug_log` call to any contract function, then run with logging enabled:

```bash
LOG_LEVEL="error;trace:debug_log" aztec test
```

You should see output like:

```
[07:40:29.947] DEBUG: txe:top_level_context:debug_log your message here
```

If no output appears, check the troubleshooting section below.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No contract logs appear in `aztec test` | Set `LOG_LEVEL` to include `debug_log`, e.g., `LOG_LEVEL="error;trace:debug_log" aztec test`. Also verify you are calling a log function inside the contract function being tested. |
| No contract logs in TypeScript tests | Set `LOG_LEVEL` to include `contract_log`, e.g., `LOG_LEVEL="error;trace:contract_log" yarn test`. |
| Import error on `dep::aztec::oracle::debug_log` | This path was removed. Update to `use aztec::oracle::logging::{debug_log, debug_log_format};`. |
| `receipt.debugLogs` is `undefined` | Debug logs are only collected in test mode (non-real-proofs). They are not available in production. |
| Too much noise in log output | Narrow the default level and use module filters, e.g., `LOG_LEVEL="error;debug:contract_log"`. |

## Quick reference

| Task | Code or command |
|------|-----------------|
| Import logging | `use aztec::oracle::logging::{debug_log, debug_log_format};` |
| Simple log | `debug_log("message");` |
| Log with values | `debug_log_format("val: {0}", [my_field]);` |
| Run Noir tests with logs | `LOG_LEVEL="error;trace:debug_log" aztec test` |
| JS tests with contract logs | `LOG_LEVEL="error;trace:contract_log" yarn test` |

## Next steps

- [Debugging Aztec Code](./debugging.md) for error codes, profiling, and common issues
- [Events and Logs](./framework-description/events_and_logs.md) for emitting events that offchain applications can consume
- [Testing Contracts](./testing_contracts.md) for writing and running contract tests
