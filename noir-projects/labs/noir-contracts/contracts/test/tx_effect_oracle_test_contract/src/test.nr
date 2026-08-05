use crate::TxEffectOracleTest;
use aztec::test::helpers::{test_environment::TestEnvironment, txe_oracles};

#[test]
unconstrained fn batch_tx_effects_match_singular_tx_effects() {
    let mut env = TestEnvironment::new();
    let contract_address = env.deploy("TxEffectOracleTest").without_initializer();
    let first_deployment_tx_hash = txe_oracles::get_last_tx_effects().tx_hash;
    let _ = env.deploy("TxEffectOracleTest").without_initializer();
    let second_deployment_tx_hash = txe_oracles::get_last_tx_effects().tx_hash;

    let first_singular_hash =
        env.execute_utility(TxEffectOracleTest::at(contract_address).get_tx_effect_hash(first_deployment_tx_hash));
    let second_singular_hash =
        env.execute_utility(TxEffectOracleTest::at(contract_address).get_tx_effect_hash(second_deployment_tx_hash));

    let batch_hashes = env.execute_utility(TxEffectOracleTest::at(contract_address).get_tx_effects_hashes([
        first_deployment_tx_hash,
        second_deployment_tx_hash,
    ]));

    assert_eq(batch_hashes, [first_singular_hash, second_singular_hash]);
}
