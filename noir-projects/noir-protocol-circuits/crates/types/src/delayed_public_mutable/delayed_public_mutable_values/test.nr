use crate::{constants::{MAX_FIELD_VALUE, MAX_U32_VALUE}, traits::Packable};
use crate::delayed_public_mutable::{
    delayed_public_mutable_values::DelayedPublicMutableValues,
    scheduled_delay_change::ScheduledDelayChange, scheduled_value_change::ScheduledValueChange,
};

global TEST_INITIAL_DELAY: u64 = 13;

#[derive(Eq, Packable)]
pub struct MockStruct {
    pub a: Field,
    pub b: Field,
}

unconstrained fn assert_equal_after_conversion<T>(
    original: DelayedPublicMutableValues<T, TEST_INITIAL_DELAY>,
)
where
    T: Packable + Eq,
{
    let converted = DelayedPublicMutableValues::<T, TEST_INITIAL_DELAY>::unpack(original.pack());

    assert_eq(original, converted);
}

#[test]
unconstrained fn test_packable() {
    let pre_delay = 1;
    let post_delay = 2;
    let timestamp_of_change = 50;

    let pre_value = MockStruct { a: 3, b: 3 };
    let post_value = MockStruct { a: 4, b: 4 };

    let test_case = |sdc_pre, sdc_post| {
        let sdc = ScheduledDelayChange::new(sdc_pre, sdc_post, timestamp_of_change);
        let svc = ScheduledValueChange::new(pre_value, post_value, timestamp_of_change);
        assert_equal_after_conversion(DelayedPublicMutableValues::new(svc, sdc));
    };

    test_case(Option::some(pre_delay), Option::some(post_delay));
    test_case(Option::some(pre_delay), Option::none());
    test_case(Option::none(), Option::some(post_delay));
    test_case(Option::none(), Option::none());
}

#[test]
unconstrained fn test_packable_large_values() {
    // We test max u32 even when the actual timestamp is u64 because the timestamp is packed in 32 bits. This makes
    // the code fail in year 2106. This is a tech debt that is not worth tackling.
    let max_u32 = MAX_U32_VALUE as u64;

    let pre_delay = max_u32;
    let post_delay = max_u32 - 1;
    let timestamp_of_change = max_u32 - 2;

    let pre_value = MockStruct { a: MAX_FIELD_VALUE, b: MAX_FIELD_VALUE };
    let post_value = MockStruct { a: MAX_FIELD_VALUE - 1, b: MAX_FIELD_VALUE - 1 };

    let test_case = |sdc_pre, sdc_post| {
        let sdc = ScheduledDelayChange::new(sdc_pre, sdc_post, timestamp_of_change);
        let svc = ScheduledValueChange::new(pre_value, post_value, timestamp_of_change);
        assert_equal_after_conversion(DelayedPublicMutableValues::new(svc, sdc));
    };

    test_case(Option::some(pre_delay), Option::some(post_delay));
    test_case(Option::some(pre_delay), Option::none());
    test_case(Option::none(), Option::some(post_delay));
    test_case(Option::none(), Option::none());
}

#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn pack_rejects_value_change_timestamp_above_u32_max() {
    let too_large = MAX_U32_VALUE as u64 + 1;
    let svc = ScheduledValueChange::new(
        MockStruct { a: 1, b: 2 },
        MockStruct { a: 3, b: 4 },
        too_large,
    );
    let sdc = ScheduledDelayChange::new(Option::some(1), Option::some(2), 3);

    let _ = DelayedPublicMutableValues::<MockStruct, TEST_INITIAL_DELAY>::new(svc, sdc).pack();
}

#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn pack_rejects_delay_change_timestamp_above_u32_max() {
    let too_large = MAX_U32_VALUE as u64 + 1;
    let svc = ScheduledValueChange::new(MockStruct { a: 1, b: 2 }, MockStruct { a: 3, b: 4 }, 3);
    let sdc = ScheduledDelayChange::new(Option::some(1), Option::some(2), too_large);

    let _ = DelayedPublicMutableValues::<MockStruct, TEST_INITIAL_DELAY>::new(svc, sdc).pack();
}

#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn pack_rejects_pre_delay_above_u32_max() {
    let too_large = MAX_U32_VALUE as u64 + 1;
    let svc = ScheduledValueChange::new(MockStruct { a: 1, b: 2 }, MockStruct { a: 3, b: 4 }, 3);
    let sdc = ScheduledDelayChange::new(Option::some(too_large), Option::some(2), 3);

    let _ = DelayedPublicMutableValues::<MockStruct, TEST_INITIAL_DELAY>::new(svc, sdc).pack();
}

#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn pack_rejects_post_delay_above_u32_max() {
    let too_large = MAX_U32_VALUE as u64 + 1;
    let svc = ScheduledValueChange::new(MockStruct { a: 1, b: 2 }, MockStruct { a: 3, b: 4 }, 3);
    let sdc = ScheduledDelayChange::new(Option::some(1), Option::some(too_large), 3);

    let _ = DelayedPublicMutableValues::<MockStruct, TEST_INITIAL_DELAY>::new(svc, sdc).pack();
}

/// Verifies that an oversized scheduled delay cannot be packed into storage.
///
/// Without this range check, the following attack would be possible:
/// 1. Initial state: empty DPM with `INITIAL_DELAY`. An honest private reader at anchor block
///    `T_anchor` computes `time_horizon = T_anchor + INITIAL_DELAY - 1` and commits to a tx with
///    `expiration_timestamp <= time_horizon`, trusting the value to be stable until then.
/// 2. Owner calls `schedule_delay_change(new_delay = u32::MAX + 2)` at some `T_attack > T_anchor`.
///    Because `new > current`, the change would be effective immediately
///    (`timestamp_of_change = T_attack`).
/// 3. If this oversized delay reached storage packing, the high bit of
///    `u32::MAX + 2 = 2^32 + 1` would overflow into the next slot.
/// 4. Any later reader unpacking from storage would see `post = 1` (truncated to u32).
/// 5. Owner calls `schedule_value_change`. The effective delay read from storage is now `1`,
///    so the value change is scheduled for `T_attack + 1`, well within the honest reader's
///    trusted time horizon -- breaking the safety guarantee of private reads.
///
/// The fix is `DelayedPublicMutableValues::pack` enforcing the 32-bit storage layout.
#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn scheduled_oversized_delay_fails_when_packed() {
    let max_u32: u64 = MAX_U32_VALUE as u64;
    let attack_delay: u64 = max_u32 + 2; // would truncate to 1 if packed without range check

    let mut sdc =
        ScheduledDelayChange::<TEST_INITIAL_DELAY>::new(Option::none(), Option::none(), 0);
    sdc.schedule_change(attack_delay, 1_000);

    let svc = ScheduledValueChange::new(MockStruct { a: 0, b: 0 }, MockStruct { a: 0, b: 0 }, 0);
    let _ = DelayedPublicMutableValues::<MockStruct, TEST_INITIAL_DELAY>::new(svc, sdc).pack();
}

#[test]
unconstrained fn schedule_change_accepts_delay_at_u32_max() {
    let max_u32: u64 = MAX_U32_VALUE as u64;

    let mut sdc =
        ScheduledDelayChange::<TEST_INITIAL_DELAY>::new(Option::none(), Option::none(), 0);
    sdc.schedule_change(max_u32, 1_000);

    assert_eq(sdc.post.unwrap(), max_u32);
}

#[test]
unconstrained fn packed_delayed_public_mutable_values_match_typescript() {
    let pre_value = MockStruct { a: 1, b: 2 };
    let post_value = MockStruct { a: 3, b: 4 };

    let sdc = ScheduledDelayChange::<0_u64>::new(Option::some(1), Option::some(50), 2);
    let svc = ScheduledValueChange::new(pre_value, post_value, 50);
    let dpmv = DelayedPublicMutableValues::new(svc, sdc);

    let packed_dpmv = dpmv.pack();

    // The following value was generated by `delayed_public_mutable_values.test.ts`
    // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
    let packed_dpmv_from_typescript = [
        0x0000000000000000000000000000000000010100000032010000000200000032,
        0x0000000000000000000000000000000000000000000000000000000000000001,
        0x0000000000000000000000000000000000000000000000000000000000000002,
        0x0000000000000000000000000000000000000000000000000000000000000003,
        0x0000000000000000000000000000000000000000000000000000000000000004,
    ];

    assert_eq(packed_dpmv, packed_dpmv_from_typescript);
}
