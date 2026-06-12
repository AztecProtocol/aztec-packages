use crate::OptionParam;
use crate::OptionParam::SomeStruct;
use aztec::{protocol::constants::MAX_FIELD_VALUE, test::helpers::test_environment::TestEnvironment};

global U64_MAX: u64 = (2.pow_32(64) - 1) as u64;
global I64_MAX: i64 = (2.pow_32(63) - 1) as i64;

#[test]
unconstrained fn passes_public_optional_struct_parameter() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();

    let option_param = OptionParam::at(env.deploy("OptionParam").without_initializer());

    let none_value = env.call_public(sender, option_param.return_public_optional_struct(Option::none()));
    assert_eq(none_value, Option::none());

    let some_value = env.call_public(
        sender,
        option_param.return_public_optional_struct(Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        )),
    );
    assert_eq(
        some_value,
        Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        ),
    );
}

#[test]
unconstrained fn passes_utility_optional_struct_parameter() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();

    let option_param = OptionParam::at(env.deploy("OptionParam").without_initializer());

    let none_value = env.execute_utility(sender, option_param.return_utility_optional_struct(Option::none()));
    assert_eq(none_value, Option::none());

    let some_value = env.execute_utility(
        sender,
        option_param.return_utility_optional_struct(Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        )),
    );
    assert_eq(
        some_value,
        Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        ),
    );
}

#[test]
unconstrained fn passes_private_optional_struct_parameter() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();

    let option_param = OptionParam::at(env.deploy("OptionParam").without_initializer());

    let none_value = env.call_private(sender, option_param.return_private_optional_struct(Option::none()));
    assert_eq(none_value, Option::none());

    let some_value = env.call_private(
        sender,
        option_param.return_private_optional_struct(Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        )),
    );
    assert_eq(
        some_value,
        Option::some(
            SomeStruct { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
        ),
    );
}
