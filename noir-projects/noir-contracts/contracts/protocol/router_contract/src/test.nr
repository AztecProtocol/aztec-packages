use crate::Router;
use dep::aztec::test::helpers::test_environment::TestEnvironment;
use aztec::utils::comparison::Comparator;

// For both block number and timestamp we only test one success and one failure case, as the rest are more thoroughly
// covered in the comparator unit tests.

#[test]
unconstrained fn check_block_number() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_number = env.next_block_number();
    router.check_block_number(Comparator.LT, expected_next_block_number + 1).call(&mut env.private());
}

#[test(should_fail_with = "Block number mismatch.")]
unconstrained fn check_block_number_fail() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_number = env.next_block_number();
    router.check_block_number(Comparator.LT, expected_next_block_number).call(&mut env.private());
}

#[test]
unconstrained fn check_timestamp() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_timestamp = env.last_block_timestamp() + 100;
    env.set_next_block_timestamp(expected_next_block_timestamp);
    router.check_timestamp(Comparator.LT, expected_next_block_timestamp + 1).call(&mut env.private());
}

#[test(should_fail_with = "Timestamp mismatch.")]
unconstrained fn check_timestamp_fail() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_timestamp = env.last_block_timestamp() + 100;
    env.set_next_block_timestamp(expected_next_block_timestamp);
    router.check_timestamp(Comparator.LT, expected_next_block_timestamp).call(&mut env.private());
}
