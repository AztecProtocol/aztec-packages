### BB PILCOM

#### Using Optimized Relations

The "use_optimized" feature flag is on by default. This means that generated files will include any optimized relations specified in BBFiles (specifically in `get_optimized_relations_file_names`);
`cargo build --workspace --release`

#### Using Generated Relations Only

To build the generated files without any optimized relations:
`cargo build --workspace --no-default-features --release`
