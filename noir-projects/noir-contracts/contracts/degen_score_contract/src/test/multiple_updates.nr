// use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
// use crate::DegenScore;

// #[test]
// unconstrained fn multiple_updates() {
//     let mut env = TestEnvironment::new();
//     let owner = env.create_account();
//     let user = env.create_account();
//     env.impersonate(owner);

//     let initializer = DegenScore::interface().constructor(owner);
//     let degen_score_contract = env.deploy_self("DegenScore").with_private_initializer(initializer);
//     let contract_address = degen_score_contract.to_address();

//     let eth_signature = [0; 65];

//     // First update
//     let update_score_interface1 = DegenScore::at(contract_address).update_degen_score(
//         user, eth_signature, 1000, 2, 3, 1, 4, 2
//     );
//     env.call_private_void(update_score_interface1);

//     let score_after_first_update = DegenScore::at(contract_address).get_degen_score(user).simulate();

//     // Second update
//     let update_score_interface2 = DegenScore::at(contract_address).update_degen_score(
//         user, eth_signature, 2000, 3, 4, 2, 5, 3
//     );
//     env.call_private_void(update_score_interface2);

//     let score_after_second_update = DegenScore::at(contract_address).get_degen_score(user).simulate();

//     assert(
//         score_after_second_update.value > score_after_first_update.value,
//         "Score should increase after second update"
//     );
// }