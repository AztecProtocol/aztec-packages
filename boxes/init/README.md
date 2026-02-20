# init

An Aztec Noir contract project.

## Compile

```bash
aztec compile
```

This compiles the contract in `contract/` and outputs artifacts to `target/`.

## Test

```bash
aztec test
```

This runs the tests in `test/`.

## Generate TypeScript bindings

```bash
aztec codegen target -o src/artifacts
```

This generates TypeScript contract artifacts from the compiled output in `target/` into `src/artifacts/`.
