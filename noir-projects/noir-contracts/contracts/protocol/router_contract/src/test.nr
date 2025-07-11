use crate::Router;
use dep::aztec::test::helpers::test_environment::TestEnvironment;
use aztec::utils::comparison::Comparator;

#[test]
unconstrained fn test_check_block_number() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    for _ in 0..7 {
        env.mine_block();
    }

    // First we sanity-check that current block number is as expected
    let current_block_number = env.next_block_number();
    assert(current_block_number == 10, "Expected pending block number to be 10");

    // We test just one success case and 1 failure case in this test as the rest is tested in the comparator unit tests
    router.check_block_number(Comparator.LT, 11).call(&mut env.private());
}

#[test(should_fail_with = "Block number mismatch.")]
unconstrained fn test_fail_check_block_number() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    for _ in 0..7 {
        env.mine_block();
    }

    // First we sanity-check that current block number is as expected
    let current_block_number = env.next_block_number();
    assert(current_block_number == 10, "Expected block number to be 10");

    router.check_block_number(Comparator.LT, 5).call(&mut env.private());
}

// TODO(#8372): Add test for check_timestamp --> setting timestamp currently not supported by TXE
