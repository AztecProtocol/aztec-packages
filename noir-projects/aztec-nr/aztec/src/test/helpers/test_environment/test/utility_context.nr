use crate::test::helpers::test_environment::TestEnvironment;

use crate::oracle::notes::check_nullifier_exists;

#[test]
unconstrained fn check_nullifier_exists_nonexistent() {
    let env = TestEnvironment::new();

    env.utility_context(|_| { assert(!check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_settled() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(1); });

    env.utility_context(|_| { assert(check_nullifier_exists(1)); });
}
