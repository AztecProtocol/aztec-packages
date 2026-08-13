use crate::macros::oracle_testing::generate_oracle_tests_excluding;

pub mod test_environment;
#[generate_oracle_tests_excluding(
    @[
        quote { deploy_oracle }, // TODO: implement once we support more complex types
        quote { set_tagging_secret_strategies }, // TODO: implement once we support more complex types
    ],
)]
pub mod txe_oracles;
pub mod authwit;
pub mod tagging_secret_strategy;
pub mod utils;
