use dep::aztec::test::helpers::test_environment::TestEnvironment;
use crate::Router;
use aztec::utils::comparison::Comparator;

#[test]
unconstrained fn test_check_block_number() {
    let mut env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    env.advance_block_by(9);

    // First we sanity-check that current block number is as expected
    let current_block_number = env.block_number();
    assert(current_block_number == 10, "Expected block number to be 10");

    // We test just one success case and 1 failure case in this test as the rest is tested in the comparator unit tests
    let call_1 = router.check_block_number(11, Comparator.GT);
    env.call_private_void(call_1);

    let call_2 = router.check_block_number(5, Comparator.GT);
    env.assert_private_call_fails(call_2);
}

// TODO(#8372): Add test for check_timestamp --> setting timestamp currently not supported by TXE