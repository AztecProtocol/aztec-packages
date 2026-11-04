# bb-pilcom

`bb_pil` is a small wrapper around powdr pil. It implements only the parts of powdr needed for direct PIL to barretenberg codegen.

## Build and use

1. Initialise the powdr submodule: `git submodule update --init bb-pilcom/powdr`.
2. Build with `./bootstrap.sh`. It runs `cargo build --release`.
3. The binary is `target/release/bb_pil`.
4. `barretenberg/cpp/scripts/avm2_gen.sh` runs it to generate the AVM code in `barretenberg/cpp/src/barretenberg/vm2/generated`.

## Using Optimized Relations

The "use_optimized" feature flag is on by default. This means that generated files will include any optimized relations specified in BBFiles (specifically in `get_optimized_relations_file_names`);
`cargo build --workspace --release`

## Using Generated Relations Only

To build the generated files without any optimized relations:
`cargo build --workspace --no-default-features --release`
