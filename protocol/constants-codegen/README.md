# Constants codegen

This directory will contain the standalone cross-language generator for Aztec protocol constants.

## Version 1 interface

The command reads a primary Noir source file, optionally adds named constants from other Noir files, and writes one
of the supported outputs.

```text
constants-codegen \
  [--input <constants.nr>] \
  [--include <file.nr>:<symbol>]... \
  [--selection <selection.json>] \
  (--typescript <output.ts> | --cpp <output.hpp> | --pil <output.pil> | --solidity <output.sol> | --rust <output.rs>)
```

- `--input` defaults to `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr` when the tool runs from
  inside the aztec-packages monorepo (resolved relative to the tool itself). Outside the
  monorepo — e.g. the published npm package — it is required.
- `--include` adds one named constant from another Noir file before evaluating expressions. It may be repeated.
- Exactly one output option is required. Run the command once per desired output.
- `--selection` filters the output to the selected symbols. Without it, the output contains every supported symbol
  from the input.
- Relative paths given as arguments are resolved from the caller's working directory.
- Invalid arguments, an unreadable input, an unsupported expression, or an output failure produce a diagnostic on
  stderr and a nonzero exit status.

A selection file is a JSON array naming Noir source symbols, including the `DOM_SEP__` prefix for domain
separators:

```json
["ARCHIVE_HEIGHT", "MAX_.*_PER_TX", "DOM_SEP__MERKLE_HASH"]
```

An entry that is not a valid symbol name is treated as a regular expression selecting every symbol whose whole
name matches it. Duplicate entries, invalid patterns, unknown symbols, and patterns that match no symbol are rejected.

Rust emits all parsed constants and domain separators: values that fit `u128` become `pub const NAME: u128` items,
and larger field-sized values become `pub const NAME: &str` hex-string items.

## Compatibility target

The implementation must preserve the symbols and values currently checked in at:

- `yarn-project/constants/src/constants.gen.ts`
- `barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp`
- `barretenberg/cpp/pil/vm2/constants_gen.pil`
- `l1-contracts/src/core/libraries/ConstantsGen.sol`

Generator instructions and formatter-only whitespace may change intentionally.
