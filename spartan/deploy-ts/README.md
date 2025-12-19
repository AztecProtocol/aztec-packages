# network/

A lightweight TypeScript module for network deployment.
This replaces earlier shell-scripts.

## Usage

```bash
yarn install
node --experimental-strip-types deploy.ts ./networks/devnet.ts
```

## Coding Philosophy

This is the philosophy of this module. The aim is to make this module as isolated as possible, optimizing as much as possible for 'TypeScript as replacement for shell scripts.'. The assumptioin is that we are writing a module that orchestrates calls to other programs in the way that a shell script does.

### Don't add typescript dependencies

We don't want yet another isolated yarn project with a big node_modules.
Runtime dependencies are not allowed. The only dependencies are dev-time tooling (TypeScript, ESLint, Prettier).
Use Node.js built-in modules and write utilities as needed.

### Don't just depend on yarn-project libraries

We want to orchestrate the user-visible artifacts from yarn-project.

### Don't use await/async

Prefer synchronous code. Async/await should only appear at the top-level entry point if unavoidable (e.g., dynamic imports). Shell commands, file I/O, and other operations should be synchronous - the deployment script runs sequentially anyway.

### No barrel exports

Import directly from source files, not from `index.ts` barrels:

```typescript
// Good
import { log, die } from "./base/log.ts";
import { exec } from "./base/shell.ts";

// Bad
import { log, die, exec } from "./base/index.ts";
```

### Tagged template literals for shell commands

Use the `$` tagged template for safe shell command construction with automatic quoting:

```typescript
import { $, exec } from "./base/shell.ts";

const file = "my file.txt";
exec($`cat ${file}`); // Executes: cat 'my file.txt'
```

### Configuration as code

Network configurations are TypeScript files that export a `NetworkConfig` object, not `.env` files. This provides type safety and allows computed values.
