// use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
// use crate::DegenScore;

// #[test]
// unconstrained fn zero_inputs() {
//     let mut env = TestEnvironment::new();
//     let owner = env.create_account();
//     let user = env.create_account();
//     env.impersonate(owner);

//     let initializer = DegenScore::interface().constructor(owner);
//     let degen_score_contract = env.deploy_self("DegenScore").with_private_initializer(initializer);
//     let contract_address = degen_score_contract.to_address();

//     let eth_signature = [0; 65];

//     let update_score_interface = DegenScore::at(contract_address).update_degen_score(
//         user, eth_signature, 0, 0, 0, 0, 0, 0
//     );
//     env.call_private_void(update_score_interface);

//     let score = DegenScore::at(contract_address).get_degen_score(user).simulate();
//     assert(score.value == 0, "Score should be 0 for zero inputs");
// }