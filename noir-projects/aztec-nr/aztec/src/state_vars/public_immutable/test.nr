use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    facts::{FactScope, get_fact_collection},
    oracle::block_reference::BlockReference,
    state_vars::{
        public_immutable::{PUBLIC_IMMUTABLE_CACHE_TYPE_ID, PUBLIC_IMMUTABLE_VALUE_READ, PublicImmutable},
        StateVariable,
    },
};
use crate::protocol::{abis::block_header::BlockHeader, address::AztecAddress, traits::{Hash, Packable}};
use crate::test::{helpers::test_environment::{PrivateContextOptions, TestEnvironment}, mocks::MockStruct};
use std::test::OracleMock;

global storage_slot: Field = 7;

fn in_public(context: PublicContext) -> PublicImmutable<MockStruct, PublicContext> {
    PublicImmutable::new(context, storage_slot)
}

fn in_private(context: &mut PrivateContext) -> PublicImmutable<MockStruct, &mut PrivateContext> {
    PublicImmutable::new(context, storage_slot)
}

fn in_utility(context: UtilityContext) -> PublicImmutable<MockStruct, UtilityContext> {
    PublicImmutable::new(context, storage_slot)
}

#[test]
unconstrained fn is_uninitialized_by_default() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.is_initialized(), false);
    });
}

#[test]
unconstrained fn initialize_uninitialized_same_tx() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        assert(state_var.is_initialized());
    });
}

#[test]
unconstrained fn initialize_uninitialized_other_tx() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        assert(state_var.is_initialized());
    });
}

#[test(should_fail_with = "Duplicate")]
unconstrained fn initialize_already_initialized_same_tx() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        let other_value = MockStruct::new(7, 8);
        state_var.initialize(other_value);
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn initialize_already_initialized_other_tx() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let value = MockStruct::new(5, 6);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        let other_value = MockStruct::new(7, 8);
        state_var.initialize(other_value);
    });
}

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn read_uninitialized_public_fails() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let _ = state_var.read();
    });
}

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn read_uninitialized_private_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.read();
    });
}

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn read_uninitialized_utility_fails() {
    let env = TestEnvironment::new();

    env.utility_context(|context| {
        let state_var = in_utility(context);
        let _ = state_var.read();
    });
}

#[test]
unconstrained fn read_initialized_public_same_tx() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_initialized_public_other_tx() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_initialized_private() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.private_context(|context| {
        let state_var = in_private(context);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_initialized_utility() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), value);
    });
}

unconstrained fn block_reference_of(header: BlockHeader) -> BlockReference {
    BlockReference { block_number: header.block_number(), block_hash: header.hash() }
}

unconstrained fn assert_recorded_value(
    contract_address: AztecAddress,
    value: MockStruct,
    origin_block: BlockReference,
) {
    let facts = get_fact_collection(
        contract_address,
        FactScope::public(),
        PUBLIC_IMMUTABLE_CACHE_TYPE_ID,
        storage_slot,
    )
        .unwrap()
        .facts;
    assert_eq(facts.len(), 1);

    let fact = facts.get(0);
    assert_eq(fact.fact_type_id, PUBLIC_IMMUTABLE_VALUE_READ);

    let packed = value.pack();
    assert_eq(fact.payload.len(), packed.len());
    for i in 0..packed.len() {
        assert_eq(fact.payload.get(i), packed[i]);
    }

    let origin = fact.origin_block.unwrap();
    assert_eq(origin.block_number, origin_block.block_number);
    assert_eq(origin.block_hash, origin_block.block_hash);
}

#[test]
unconstrained fn utility_read_records_value_at_anchor_block() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.utility_context(|context| {
        let state_var = in_utility(context);
        let _ = state_var.read();

        assert_recorded_value(
            context.this_address(),
            value,
            block_reference_of(context.block_header()),
        );
    });
}

#[test]
unconstrained fn private_read_records_value_at_anchor_block() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.read();

        assert_recorded_value(
            context.this_address(),
            value,
            block_reference_of(context.get_anchor_block_header()),
        );
    });
}

#[test]
unconstrained fn utility_read_does_not_fetch_cached_value() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    let storage_read_mock = OracleMock::mock("aztec_utl_getFromPublicStorage").returns(value.pack());

    env.utility_context(|context| {
        let state_var = in_utility(context);
        let _ = state_var.read();
    });
    assert_eq(storage_read_mock.times_called(), 1);

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), value);
    });
    assert_eq(storage_read_mock.times_called(), 1);
}

#[test]
unconstrained fn private_read_does_not_fetch_cached_value() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    let storage_read_mock = OracleMock::mock("aztec_utl_getFromPublicStorage").returns(value.pack());

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.read();
    });
    assert_eq(storage_read_mock.times_called(), 1);

    env.private_context(|context| {
        let state_var = in_private(context);
        assert_eq(state_var.read(), value);
    });
    assert_eq(storage_read_mock.times_called(), 1);
}

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn private_read_at_block_before_initialization_fails_despite_cache() {
    let env = TestEnvironment::new();
    let block_before_initialization = env.last_block_number();

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(MockStruct::new(5, 6));
    });

    env.private_context(|context| {
        let state_var = in_private(context);
        // This read populates the cache at the current anchor block. The read below still fails, because at that anchor
        // block the variable was uninitialized.
        let _ = state_var.read();
    });

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(block_before_initialization),
        |context| {
            let state_var = in_private(context);
            let _ = state_var.read();
        },
    );
}

#[test]
unconstrained fn private_read_uses_value_cached_at_later_anchor_block() {
    let env = TestEnvironment::new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });
    let earlier_anchor_block_number = env.last_block_number();
    env.mine_block();

    let cached_at = env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.read();
        block_reference_of(context.get_anchor_block_header())
    });
    assert(cached_at.block_number > earlier_anchor_block_number);

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(earlier_anchor_block_number),
        |context| {
            let state_var = in_private(context);
            assert_eq(state_var.read(), value);

            assert_recorded_value(context.this_address(), value, cached_at);
        },
    );
}
