use crate::oracle::notes::check_nullifier_exists;
use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};
use protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress, traits::FromField,
};

#[test]
unconstrained fn at_sets_contract_address() {
    let env = TestEnvironment::new();
    let contract_address = AztecAddress::from_field(17);

    env.private_context_at(contract_address, |context| {
        assert_eq(context.this_address(), contract_address);
    });
}

#[test]
unconstrained fn opts_sets_contract_address_and_anchor_block_number() {
    let env = TestEnvironment::new();

    env.mine_block();
    let anchor_block_number = env.last_block_number() - 1;

    let contract_address = AztecAddress::from_field(17);

    env.private_context_opts(
        PrivateContextOptions::new().at_contract_address(contract_address),
        |context| { assert_eq(context.this_address(), contract_address); },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(anchor_block_number),
        |context| {
            assert_eq(
                context.get_anchor_block_header().global_variables.block_number,
                anchor_block_number,
            );
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_contract_address(contract_address).at_anchor_block_number(
            anchor_block_number,
        ),
        |context| {
            assert_eq(context.this_address(), contract_address);
            assert_eq(
                context.get_anchor_block_header().global_variables.block_number,
                anchor_block_number,
            );
        },
    );
}

#[test]
unconstrained fn uses_last_block_number() {
    let env = TestEnvironment::new();

    let last_block_number = env.last_block_number();

    env.private_context(|context| {
        assert_eq(
            last_block_number,
            context.get_anchor_block_header().global_variables.block_number,
        );
    });
}

#[test]
unconstrained fn advances_block_number() {
    let env = TestEnvironment::new();

    let first_block_number = env.private_context(|context| {
        context.get_anchor_block_header().global_variables.block_number
    });
    let second_block_number = env.private_context(|context| {
        context.get_anchor_block_header().global_variables.block_number
    });

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn does_not_advance_the_timestamp() {
    let env = TestEnvironment::new();

    env.private_context(|_| {});
    let first_timestamp = env.last_block_timestamp();
    env.private_context(|_| {});
    let second_timestamp = env.last_block_timestamp();

    assert_eq(second_timestamp, first_timestamp);
}

#[test(should_fail_with = "Duplicate siloed nullifier")]
unconstrained fn rejects_duplicate_transient_nullifiers() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        context.push_nullifier(1);
        context.push_nullifier(1);
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn rejects_duplicate_settled_nullifiers() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(1); });

    env.private_context(|context| { context.push_nullifier(1); });
}

#[test]
unconstrained fn repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.private_context(|context| context.this_address());
    let second_address = env.private_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test(should_fail_with = "Contract calls are forbidden")]
unconstrained fn private_call_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ =
            context.call_private_function_no_args(AztecAddress::zero(), FunctionSelector::zero());
    });
}

#[test(should_fail_with = "Enqueueing public calls is not supported")]
unconstrained fn public_call_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ =
            context.call_public_function_no_args(AztecAddress::zero(), FunctionSelector::zero());
    });
}

#[test(should_fail_with = "Enqueueing public calls is not supported")]
unconstrained fn set_teardown_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ = context.set_public_teardown_function(
            AztecAddress::zero(),
            FunctionSelector::zero(),
            [],
        );
    });
}

#[test]
unconstrained fn check_nullifier_exists_nonexistent() {
    let env = TestEnvironment::new();

    env.private_context(|_| { assert(!check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_settled() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(1); });

    env.private_context(|_| { assert(check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        context.push_nullifier(1);
        assert(check_nullifier_exists(1));
    });
}
