use ::rollup_lib::root::{root_rollup, RootRollupPrivateInputs, RootRollupPublicInputs};

fn main(inputs: RootRollupPrivateInputs) -> pub RootRollupPublicInputs {
    root_rollup::execute(inputs)
}
