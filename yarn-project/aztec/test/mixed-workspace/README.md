# Mixed Workspace Test

Regression test for `aztec compile` and `aztec codegen` in Nargo workspaces that
contain both Aztec contracts and plain Noir circuits.

## Problem

Both `aztec compile` and `aztec codegen` assumed every `.json` in `target/` is a
contract artifact. When a workspace also contains `type = "bin"` packages, the
resulting program artifacts lack `functions`/`name` fields, causing:

- `bb aztec_process` to fail trying to transpile a program artifact
- The jq postprocessing step to fail on missing `.functions`
- `codegen` to crash calling `loadContractArtifact()` on a program artifact

## What the test checks

`yarn-project/aztec/src/cli/cmds/compile.test.ts` runs compile and codegen on
this workspace and verifies:

1. Compilation succeeds without errors
2. Both artifacts exist in `target/`
3. The contract artifact was postprocessed (has `transpiled` field)
4. The program artifact was not modified (no `transpiled` field)
5. Codegen generates a TypeScript wrapper only for the contract
6. No TypeScript wrapper is generated for the program artifact
