use crate::AbiTypes;
use crate::AbiTypes::CustomStruct;
use aztec::{protocol::constants::MAX_FIELD_VALUE, test::helpers::test_environment::TestEnvironment};

global U64_MAX: u64 = (2.pow_32(64) - 1) as u64;

global I64_MAX: i64 = (2.pow_32(63) - 1) as i64;
global I64_MIN: i64 = -I64_MAX - 1;

#[test]
unconstrained fn pass_public_parameters() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();

    let abi_types = AbiTypes::at(env.deploy("AbiTypes").without_initializer());

    let min_range_return_values = env.call_public(
        sender,
        abi_types.return_public_parameters(false, 0, 0, I64_MIN, CustomStruct { w: 0, x: false, y: 0, z: I64_MIN }),
    );
    assert_eq(min_range_return_values, (false, 0, 0, I64_MIN, CustomStruct { w: 0, x: false, y: 0, z: I64_MIN }));

    let max_range_return_values = env.call_public(
        sender,
        abi_types.return_public_parameters(
            true,
            MAX_FIELD_VALUE,
            U64_MAX,
            I64_MAX,
            CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        ),
    );
    assert_eq(
        max_range_return_values,
        (true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX }),
    );
}

#[test]
unconstrained fn pass_private_parameters() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();

    let abi_types = AbiTypes::at(env.deploy("AbiTypes").without_initializer());

    let min_range_return_values = env.call_private(
        sender,
        abi_types.return_private_parameters(false, 0, 0, I64_MIN, CustomStruct { w: 0, x: false, y: 0, z: I64_MIN }),
    );
    assert_eq(min_range_return_values, (false, 0, 0, I64_MIN, CustomStruct { w: 0, x: false, y: 0, z: I64_MIN }));

    let max_range_return_values = env.call_private(
        sender,
        abi_types.return_private_parameters(
            true,
            MAX_FIELD_VALUE,
            U64_MAX,
            I64_MAX,
            CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        ),
    );
    assert_eq(
        max_range_return_values,
        (true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX }),
    );
}

#[test]
unconstrained fn pass_utility_parameters() {
    let mut env = TestEnvironment::new();

    let abi_types = AbiTypes::at(env.deploy("AbiTypes").without_initializer());

    let min_range_return_values = env.execute_utility(abi_types.return_utility_parameters(
        false,
        0,
        0,
        I64_MIN,
        CustomStruct { w: 0, x: false, y: 0, z: I64_MIN },
    ));
    assert_eq(min_range_return_values, (false, 0, 0, I64_MIN, CustomStruct { w: 0, x: false, y: 0, z: I64_MIN }));

    let max_range_return_values = env.execute_utility(abi_types.return_utility_parameters(
        true,
        MAX_FIELD_VALUE,
        U64_MAX,
        I64_MAX,
        CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
    ));
    assert_eq(
        max_range_return_values,
        (true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, CustomStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX }),
    );
}
