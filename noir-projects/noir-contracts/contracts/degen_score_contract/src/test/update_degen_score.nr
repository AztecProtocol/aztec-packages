// use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
// use crate::DegenScore;

// #[test]
// unconstrained fn update_degen_score() {
//     let mut env = TestEnvironment::new();
//     let owner = env.create_account();
//     let user = env.create_account();
//     env.impersonate(owner);

//     let initializer = DegenScore::interface().constructor(owner);
//     let degen_score_contract = env.deploy_self("DegenScore").with_private_initializer(initializer);
//     let contract_address = degen_score_contract.to_address();

//     let eth_signature = [0; 65];
//     let trading_volume = 1000;
//     let leverage_score = 2;
//     let yield_farming_score = 3;
//     let nft_score = 1;
//     let risk_score = 4;
//     let token_diversity = 2;

//     let update_score_interface = DegenScore::at(contract_address).update_degen_score(
//         user,
//         eth_signature,
//         trading_volume,
//         leverage_score,
//         yield_farming_score,
//         nft_score,
//         risk_score,
//         token_diversity,
//     );
//     env.call_private_void(update_score_interface);

//     let expected_score = trading_volume / 1000 +
//         leverage_score * 10 +
//         yield_farming_score * 5 +
//         nft_score * 2 +
//         risk_score * 15 +
//         token_diversity * 3;

//     let current_score = DegenScore::at(contract_address).get_degen_score(user).simulate();
//     assert(current_score.value == expected_score, f"Expected score {expected_score} but got {current_score.value}");
// }
