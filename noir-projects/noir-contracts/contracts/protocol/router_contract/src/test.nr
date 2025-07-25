use crate::Router;
use dep::aztec::{
    protocol_types::{address::AztecAddress, traits::Empty},
    test::helpers::test_environment::TestEnvironment,
};
use aztec::utils::comparison::Comparator;

// For both block number and timestamp we only test one success and one failure case, as the rest are more thoroughly
// covered in the comparator unit tests.

#[test]
unconstrained fn check_block_number() {
    let env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_number = env.next_block_number();
    let _ = env.call_private(
        AztecAddress::empty(),
        router.check_block_number(Comparator.LT, expected_next_block_number + 1),
    );
}

#[test(should_fail)] // should_fail_with = "Block number mismatch."
unconstrained fn check_block_number_fail() {
    let env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_number = env.next_block_number();
    let _ = env.call_private(
        AztecAddress::empty(),
        router.check_block_number(Comparator.LT, expected_next_block_number),
    );
}

#[test]
unconstrained fn check_timestamp() {
    let env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_timestamp = env.last_block_timestamp() + 100;
    env.set_next_block_timestamp(expected_next_block_timestamp);
    let _ = env.call_private(
        AztecAddress::empty(),
        router.check_timestamp(Comparator.LT, expected_next_block_timestamp + 1),
    );
}

#[test(should_fail)] // should_fail_with = "Timestamp mismatch."
unconstrained fn check_timestamp_fail() {
    let env = TestEnvironment::new();

    let router_contract = env.deploy_self("Router").without_initializer();
    let router_contract_address = router_contract.to_address();
    let router = Router::at(router_contract_address);

    let expected_next_block_timestamp = env.last_block_timestamp() + 100;
    env.set_next_block_timestamp(expected_next_block_timestamp);
    let _ = env.call_private(
        AztecAddress::empty(),
        router.check_timestamp(Comparator.LT, expected_next_block_timestamp),
    );
}
