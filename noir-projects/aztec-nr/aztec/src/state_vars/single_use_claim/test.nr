use crate::{
    context::{PrivateContext, UtilityContext},
    oracle::random::random,
    state_vars::{OwnedStateVariable, SingleUseClaim},
};
use crate::protocol::{address::AztecAddress, traits::FromField};
use crate::test::helpers::test_environment::TestEnvironment;

global STORAGE_SLOT: Field = 17;

unconstrained fn in_private(context: &mut PrivateContext, owner: AztecAddress) -> SingleUseClaim<&mut PrivateContext> {
    SingleUseClaim::new(context, STORAGE_SLOT, owner)
}

unconstrained fn in_utility(
    context: UtilityContext,
    storage_slot: Field,
    owner: AztecAddress,
) -> SingleUseClaim<UtilityContext> {
    SingleUseClaim::new(context, storage_slot, owner)
}

#[test(should_fail_with = "Duplicate siloed nullifier")]
unconstrained fn claim_twice_same_tx() {
    let mut env = TestEnvironment::new();

    let owner = env.create_light_account();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.claim();
        state_var.assert_claimed();

        state_var.claim();
    });
}

#[test]
unconstrained fn has_not_yet_claimed() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    env.utility_context(|context| {
        let state_var = in_utility(context, STORAGE_SLOT, owner);
        assert(!state_var.has_claimed());
    });
}

#[test(should_fail_with = "cannot prove claim exists")]
unconstrained fn assert_claimed_fails() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    env.private_context(|context| {
        let state_var = in_private(context, owner);
        state_var.assert_claimed();
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn claim_twice_separate_tx() {
    let mut env = TestEnvironment::new();

    let owner = env.create_light_account();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.claim();
        state_var.assert_claimed();
    });

    env.utility_context(|context| {
        let state_var = in_utility(context, STORAGE_SLOT, owner);
        assert(state_var.has_claimed());
    });

    env.private_context(|context| {
        let state_var = in_private(context, owner);
        state_var.claim();
    });
}

#[test]
unconstrained fn claim_twice_different_owner() {
    let mut env = TestEnvironment::new();

    let owner_a = env.create_light_account();
    let owner_b = env.create_light_account();

    env.private_context(|context| {
        let state_var_a = in_private(context, owner_a);
        let state_var_b = in_private(context, owner_b);

        state_var_a.claim();
        state_var_b.claim();

        state_var_a.assert_claimed();
        state_var_b.assert_claimed();
    });

    env.utility_context(|context| {
        let state_var_a = in_utility(context, STORAGE_SLOT, owner_a);
        let state_var_b = in_utility(context, STORAGE_SLOT, owner_b);

        assert(state_var_a.has_claimed());
        assert(state_var_b.has_claimed());
    });
}

#[test]
unconstrained fn claim_two_claim_ids_different_state_vars() {
    let mut env = TestEnvironment::new();

    let owner = env.create_light_account();

    env.private_context(|context| {
        let state_var_a = SingleUseClaim::new(context, STORAGE_SLOT, owner);
        state_var_a.claim();
        state_var_a.assert_claimed();

        let state_var_b = SingleUseClaim::new(context, STORAGE_SLOT + 1, owner);
        state_var_b.claim();
        state_var_b.assert_claimed();
    });

    env.utility_context(|context| {
        let state_var_0 = in_utility(context, STORAGE_SLOT, owner);
        assert(state_var_0.has_claimed());

        let state_var_1 = in_utility(context, STORAGE_SLOT + 1, owner);
        assert(state_var_1.has_claimed());
    });
}

#[test(should_fail_with = "Public keys not registered for account")]
unconstrained fn claim_owner_unknown_public_keys() {
    let mut env = TestEnvironment::new();

    let owner = AztecAddress::from_field(random());

    env.private_context(|context| {
        let state_var = in_private(context, owner);
        state_var.claim();
    });
}
