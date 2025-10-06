# Aztec TypeScript Monorepo Development Commands

## Project Structure
- TypeScript monorepo with each folder being a package
- Root directory: `yarn-project`

## Compilation Commands

### Full Project
```bash
yarn tsc -b
```

### Specific Package
```bash
cd <package-name>
yarn tsc -b
```

## Testing Commands

### Run Test File in Package
```bash
cd <package-name>
yarn test FILENAME
```

### Run Specific Test
```bash
cd <package-name>
yarn test FILENAME -t 'test-name'
```

### End-to-End Tests (Special Case)
```bash
cd end-to-end
yarn test:e2e FILENAME
```
**IMPORTANT**: Never run more than one e2e test in parallel

### Sequential Testing (for packages with port conflicts)
Some packages (e.g., ethereum) must run tests sequentially due to service conflicts (anvil ports):
```bash
cd <package-name>
yarn test --runInBand
```

## Logging During Tests
Set `LOG_LEVEL` environment variable:
```bash
env LOG_LEVEL=verbose yarn test FILENAME
env LOG_LEVEL=debug yarn test FILENAME
```

Available levels: trace, debug, verbose, info, warn (verbose recommended)

Example:
```bash
cd aztec-node
env LOG_LEVEL=verbose yarn test some-test-file.test.ts
```

## Dependency Management
After changing dependencies in any package.json:
```bash
yarn && yarn prepare
```

## Format and Lint
Always run before committing:
```bash
yarn format
yarn lint
```
