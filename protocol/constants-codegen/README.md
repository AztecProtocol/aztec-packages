# Constants codegen

This directory will contain the standalone cross-language generator for Aztec protocol constants.

## Version 1 interface

The command reads a primary Noir source file, optionally adds named constants from other Noir files, and writes any
requested combination of the four outputs produced by the existing generator.

```text
constants-codegen \
  --input <constants.nr> \
  [--include <file.nr>:<symbol>]... \
  [--typescript <output.ts> [--typescript-selection <selection.json>]] \
  [--cpp <output.hpp> [--cpp-selection <selection.json>]] \
  [--pil <output.pil> [--pil-selection <selection.json>]] \
  [--solidity <output.sol> [--solidity-selection <selection.json>]]
```

- `--input` is required.
- `--include` adds one named constant from another Noir file before evaluating expressions. It may be repeated.
- At least one output option is required, and any combination of output options may be used in one invocation.
- Each output may have its own selection file. Without one, that output contains every supported symbol from the input.
- Relative paths are resolved from the caller's working directory. The tool does not infer paths from the monorepo
  layout.
- Invalid arguments, an unreadable input, an unsupported expression, or an output failure produce a diagnostic on
  stderr and a nonzero exit status.

A selection file names Noir source symbols and has the following shape:

```json
{
  "constants": ["ARCHIVE_HEIGHT"],
  "domainSeparators": ["MERKLE_HASH"]
}
```

Both properties are required. Domain separator names omit the `DOM_SEP__` output prefix. Duplicate, invalid, or
unknown symbols are rejected.

## Compatibility target

The implementation must preserve the symbols and values currently checked in at:

- `yarn-project/constants/src/constants.gen.ts`
- `barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp`
- `barretenberg/cpp/pil/vm2/constants_gen.pil`
- `l1-contracts/src/core/libraries/ConstantsGen.sol`

Generator instructions and formatter-only whitespace may change intentionally.
