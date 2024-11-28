pub(crate) mod components;
pub(crate) mod state_diff_hints;
mod private_base_rollup;
mod public_base_rollup;
mod tests;

pub use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
pub use private_base_rollup::PrivateBaseRollupInputs;
pub use public_base_rollup::PublicBaseRollupInputs;
