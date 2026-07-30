use crate::macros::oracle_testing::generate_oracle_tests_excluding;

pub mod test_environment;
#[generate_oracle_tests_excluding(
    @[
        quote { get_last_tx_effects_oracle }, // TODO: implement once we support more complex types
        quote { get_last_call_offchain_effects_oracle }, // TODO: implement once we support more complex types
        quote { get_last_call_context }, // TODO: implement once we support more complex types
        quote { get_private_events_oracle }, // TODO: implement once we support more complex types
        quote { deploy_oracle }, // TODO: implement once we support more complex types
        quote { create_account }, // TODO: implement once we support more complex types
        quote { add_account }, // TODO: implement once we support more complex types
        quote { private_call_new_flow_oracle }, // TODO: implement once we support more complex types
        quote { public_call_new_flow_oracle }, // TODO: implement once we support more complex types
        quote { set_private_txe_context_oracle }, // TODO: implement once we support more complex types
        quote { set_tagging_secret_strategies }, // TODO: implement once we support more complex types
    ],
)]
pub mod txe_oracles;
pub mod authwit;
pub mod tagging_secret_strategy;
pub mod utils;
