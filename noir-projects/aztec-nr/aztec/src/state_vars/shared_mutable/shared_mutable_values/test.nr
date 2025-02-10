use crate::{
    state_vars::shared_mutable::{
        scheduled_delay_change::ScheduledDelayChange, scheduled_value_change::ScheduledValueChange,
        shared_mutable_values::SharedMutableValues,
    },
    test::mocks::mock_struct::MockStruct,
};
use protocol_types::{constants::MAX_FIELD_VALUE, traits::Packable};

global TEST_INITIAL_DELAY: u32 = 13;

unconstrained fn assert_equal_after_conversion<T, let N: u32>(
    original: SharedMutableValues<T, TEST_INITIAL_DELAY>,
)
where
    T: Packable<N> + Eq,
{
    let converted = SharedMutableValues::<T, TEST_INITIAL_DELAY>::unpack(original.pack());

    assert_eq(original, converted); // This also tests the Eq impl
    assert_eq(original.svc.pre, converted.svc.pre);
    assert_eq(original.svc.post, converted.svc.post);
    assert_eq(original.svc.block_of_change, converted.svc.block_of_change);
    assert_eq(original.sdc.pre, converted.sdc.pre);
    assert_eq(original.sdc.post, converted.sdc.post);
    assert_eq(original.sdc.block_of_change, converted.sdc.block_of_change);
}

#[test]
unconstrained fn test_packable() {
    let pre_delay = 1;
    let post_delay = 2;
    let block_of_change = 50;

    let pre_value = MockStruct::new(3, 3);
    let post_value = MockStruct::new(4, 4);

    let test_case = |sdc_pre, sdc_post| {
        let sdc = ScheduledDelayChange::new(sdc_pre, sdc_post, block_of_change);
        let svc = ScheduledValueChange::new(pre_value, post_value, block_of_change);
        assert_equal_after_conversion(SharedMutableValues::new(svc, sdc));
    };

    test_case(Option::some(pre_delay), Option::some(post_delay));
    test_case(Option::some(pre_delay), Option::none());
    test_case(Option::none(), Option::some(post_delay));
    test_case(Option::none(), Option::none());
}

#[test]
unconstrained fn test_packable_large_values() {
    let max_u32 = ((1 as u64 << 32) - 1) as u32;

    let pre_delay = max_u32;
    let post_delay = max_u32 - 1;
    let block_of_change = max_u32 - 2;

    let pre_value = MockStruct::new(MAX_FIELD_VALUE, MAX_FIELD_VALUE);
    let post_value = MockStruct::new(MAX_FIELD_VALUE - 1, MAX_FIELD_VALUE - 1);

    let test_case = |sdc_pre, sdc_post| {
        let sdc = ScheduledDelayChange::new(sdc_pre, sdc_post, block_of_change);
        let svc = ScheduledValueChange::new(pre_value, post_value, block_of_change);
        assert_equal_after_conversion(SharedMutableValues::new(svc, sdc));
    };

    test_case(Option::some(pre_delay), Option::some(post_delay));
    test_case(Option::some(pre_delay), Option::none());
    test_case(Option::none(), Option::some(post_delay));
    test_case(Option::none(), Option::none());
}
