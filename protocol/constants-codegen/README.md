# Constants codegen

Generates Aztec protocol constants for TypeScript, C++, PIL, Solidity and Rust from the Noir definitions in
`noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr`. It is published as
`@aztec-foundation/constants-codegen`.

## Build and test

From the repo root: `make constants-codegen` and `make constants-codegen-tests`. In this directory, `yarn test`
runs `node --test src/*.test.ts`, builds, then runs `scripts/test-package.sh`.

## Usage

The command reads a Noir source file and writes one of the supported outputs.

```text
constants-codegen \
  [--input <constants.nr>] \
  [--selection <selection.json>] \
  (--typescript <output.ts> | --cpp <output.hpp> | --pil <output.pil> | --solidity <output.sol> | --rust <output.rs>)
```

- `--input` defaults to `inputs/constants.nr` under the package root. `scripts/embed-inputs.sh` copies it in at build
  time, so both the published npm package and the built in-repo package work without `--input`.
- In-repo callers use `scripts/generate.sh`, which refreshes that copy from the sources first and then forwards its
  arguments to the CLI, for example `scripts/generate.sh --typescript <out.ts>`.
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

## Consumers

- barretenberg C++: `barretenberg/cpp/scripts/remake-constants.sh` (`--cpp`, run at CMake configure time) writes
  `aztec_constants.hpp`, which is gitignored.
- AVM PIL: `barretenberg/cpp/scripts/avm2_gen.sh` (`--pil`) writes `barretenberg/cpp/pil/vm2/constants_gen.pil`,
  which is gitignored.
- Solidity: `l1-contracts/scripts/remake-constants.sh` (`--solidity`) writes
  `l1-contracts/src/core/libraries/ConstantsGen.sol`, which is checked in.
- TypeScript: labs `yarn-project/constants/scripts/remake-constants.sh` (`--typescript`) writes `constants.gen.ts`
  in aztec-node, which is gitignored there.
