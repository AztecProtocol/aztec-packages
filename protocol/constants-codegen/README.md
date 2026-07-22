# Constants codegen

This directory will contain the standalone cross-language generator for Aztec protocol constants.

## Version 1 interface

The command reads a primary Noir source file, optionally adds named constants from other Noir files, and writes any
requested combination of the supported outputs.

```text
constants-codegen \
  [--input <constants.nr>] \
  [--include <file.nr>:<symbol>]... \
  [--typescript <output.ts> [--typescript-selection <selection.json>]] \
  [--cpp <output.hpp> [--cpp-selection <selection.json>]] \
  [--pil <output.pil> [--pil-selection <selection.json>]] \
  [--solidity <output.sol> [--solidity-selection <selection.json>]] \
  [--rust <output.rs>]
```

- `--input` defaults to `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr` when the tool runs from
  inside the aztec-packages monorepo (resolved relative to the tool itself). Outside the
  monorepo — e.g. the published npm package — it is required.
- `--include` adds one named constant from another Noir file before evaluating expressions. It may be repeated.
- At least one output option is required, and any combination of output options may be used in one invocation.
- Each output may have its own selection file. Without one, that output contains every supported symbol from the input.
- Relative paths given as arguments are resolved from the caller's working directory.
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

Rust emits all parsed constants and domain separators: values that fit `u128` become `pub const NAME: u128` items,
and larger field-sized values become `pub const NAME: &str` hex-string items.

## Compatibility target

The implementation must preserve the symbols and values currently checked in at:

- `yarn-project/constants/src/constants.gen.ts`
- `barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp`
- `barretenberg/cpp/pil/vm2/constants_gen.pil`
- `l1-contracts/src/core/libraries/ConstantsGen.sol`

Generator instructions and formatter-only whitespace may change intentionally.
