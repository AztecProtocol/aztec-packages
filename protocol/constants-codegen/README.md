# Constants codegen

This directory will contain the standalone cross-language generator for Aztec protocol constants.

## Version 1 interface

The command reads one Noir source file and writes any requested combination of the four outputs produced by the
existing generator.

```text
constants-codegen \
  --input <constants.nr> \
  [--typescript <output.ts>] \
  [--cpp <output.hpp>] \
  [--pil <output.pil>] \
  [--solidity <output.sol>]
```

- `--input` is required.
- At least one output option is required, and any combination of output options may be used in one invocation.
- Relative paths are resolved from the caller's working directory. The tool does not infer paths from the monorepo
  layout.
- Invalid arguments, an unreadable input, an unsupported expression, or an output failure produce a diagnostic on
  stderr and a nonzero exit status.

Version 1 preserves the existing renderer behavior, including each language's current embedded symbol allowlist.
TypeScript emits all parsed constants and domain separators; C++, PIL, and Solidity retain their current selected
subsets and formatting.

## Compatibility target

The implementation must preserve the symbols and values currently checked in at:

- `yarn-project/constants/src/constants.gen.ts`
- `barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp`
- `barretenberg/cpp/pil/vm2/constants_gen.pil`
- `l1-contracts/src/core/libraries/ConstantsGen.sol`

Generator instructions and formatter-only whitespace may change intentionally.
