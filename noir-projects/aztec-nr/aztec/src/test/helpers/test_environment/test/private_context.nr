use crate::test::{
    helpers::test_environment::{PrivateContextOptions, TestEnvironment},
    mocks::mock_struct::MockStruct,
};
use protocol_types::{address::AztecAddress, traits::FromField};

use dep::std::mem::zeroed;

global storage_slot: Field = 13;

global value: MockStruct = MockStruct { a: 17, b: 42 };
global other_value: MockStruct = MockStruct { a: 7, b: 8 };

global nullifier: Field = 9;

#[test]
unconstrained fn at_sets_contract_address() {
    let mut env = TestEnvironment::_new();
    let contract_address = AztecAddress::from_field(17);

    env.private_context_at(contract_address, |context| {
        assert_eq(context.this_address(), contract_address);
    });
}

#[test]
unconstrained fn opts_sets_contract_address_and_historical_block_number() {
    let mut env = TestEnvironment::_new();

    env.mine_block();
    let historical_block_number = env.last_block_number() - 1;

    let contract_address = AztecAddress::from_field(17);

    env.private_context_opts(
        PrivateContextOptions::new().at_contract_address(contract_address),
        |context| { assert_eq(context.this_address(), contract_address); },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(historical_block_number),
        |context| {
            assert_eq(
                context.get_block_header().global_variables.block_number,
                historical_block_number,
            );
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new()
            .at_contract_address(contract_address)
            .at_historical_block_number(historical_block_number),
        |context| {
            assert_eq(context.this_address(), contract_address);
            assert_eq(
                context.get_block_header().global_variables.block_number,
                historical_block_number,
            );
        },
    );
}

// #[test]
// unconstrained fn default_storage_value() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| {
//         assert_eq(context.storage_read::<MockStruct, _>(storage_slot), zeroed());
//     });
// }

// #[test]
// unconstrained fn storage_write_in_same_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| {
//         context.storage_write(storage_slot, value);
//         assert_eq(context.storage_read(storage_slot), value);
//     });
// }

// #[test]
// unconstrained fn storage_write_in_future_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| { context.storage_write(storage_slot, value); });

//     env.public_context(|context| { assert_eq(context.storage_read(storage_slot), value); });
// }

// #[test]
// unconstrained fn storage_multiple_writes_in_same_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| {
//         context.storage_write(storage_slot, value);
//         context.storage_write(storage_slot, other_value);

//         assert_eq(context.storage_read(storage_slot), other_value);
//     });
// }

// #[test]
// unconstrained fn storage_multiple_writes_in_future_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| { context.storage_write(storage_slot, value); });

//     env.public_context(|context| {
//         context.storage_write(storage_slot, other_value);
//         assert_eq(context.storage_read(storage_slot), other_value);
//     });
// }

// #[test]
// unconstrained fn read_nonexistent_nullifier() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| {
//         assert(!context.nullifier_exists(nullifier, context.this_address()));
//     });
// }

// #[test]
// unconstrained fn read_public_nullifier_same_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| {
//         context.push_nullifier(nullifier);
//         assert(context.nullifier_exists(nullifier, context.this_address()));
//     });
// }

// #[test]
// unconstrained fn read_public_nullifier_other_context() {
//     let mut env = TestEnvironment::_new();

//     env.public_context(|context| { context.push_nullifier(nullifier); });

//     env.public_context(|context| {
//         assert(context.nullifier_exists(nullifier, context.this_address()));
//     });
// }

// #[test]
// unconstrained fn read_private_nullifier() {
//     let mut env = TestEnvironment::_new();

//     env.private_context(|context| { context.push_nullifier(nullifier); });

//     env.public_context(|context| {
//         assert(context.nullifier_exists(nullifier, context.this_address()));
//     });
// }
