// use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
// use crate::DegenScore;

// #[test]
// unconstrained fn multiple_users() {
//     let mut env = TestEnvironment::new();
//     let owner = env.create_account();
//     let user1 = env.create_account();
//     let user2 = env.create_account();
//     env.impersonate(owner);

//     let initializer = DegenScore::interface().constructor(owner);
//     let degen_score_contract = env.deploy_self("DegenScore").with_private_initializer(initializer);
//     let contract_address = degen_score_contract.to_address();

//     let eth_signature = [0; 65];

//     let update_score_interface1 = DegenScore::at(contract_address).update_degen_score(
//         user1, eth_signature, 1000, 2, 3, 1, 4, 2
//     );
//     env.call_private_void(update_score_interface1);

//     let update_score_interface2 = DegenScore::at(contract_address).update_degen_score(
//         user2, eth_signature, 2000, 3, 4, 2, 5, 3
//     );
//     env.call_private_void(update_score_interface2);

//     let score_user1 = DegenScore::at(contract_address).get_degen_score(user1).simulate();
//     let score_user2 = DegenScore::at(contract_address).get_degen_score(user2).simulate();

//     assert(score_user1.value > 0, "User1 score should be greater than 0");
//     assert(score_user2.value > 0, "User2 score should be greater than 0");
//     assert(score_user2.value > score_user1.value, "User2 score should be greater than User1 score");
// }