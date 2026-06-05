use logging_example::LoggingExample;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let contract_address = env.deploy("@logging_example/LoggingExample")
        .with_public_initializer(owner, LoggingExample::interface().constructor());
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_private_logging() {
    let (env, contract_address, owner) = setup();
    env.call_private(owner, LoggingExample::at(contract_address).log_private(42));
}

#[test]
unconstrained fn test_public_logging() {
    let (env, contract_address, owner) = setup();
    env.call_public(owner, LoggingExample::at(contract_address).log_public(99));
}

#[test]
unconstrained fn test_all_log_levels() {
    let (env, contract_address, owner) = setup();
    env.call_private(owner, LoggingExample::at(contract_address).log_all_levels(42));
}

#[test]
unconstrained fn test_format_patterns() {
    let (env, contract_address, owner) = setup();
    env.call_private(
        owner,
        LoggingExample::at(contract_address).log_format_patterns(10, 20, 30),
    );
}

#[test]
unconstrained fn test_log_with_address() {
    let (env, contract_address, owner) = setup();
    env.call_private(
        owner,
        LoggingExample::at(contract_address).log_with_address(owner),
    );
}

#[test]
unconstrained fn test_utility_logging() {
    let (env, contract_address, _owner) = setup();
    let _ = env.execute_utility(LoggingExample::at(contract_address).log_utility(77));
}
