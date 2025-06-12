pub global for_loop_no_op: fn(u32) -> () = |_i: u32| ();

// Sometimes these are exactly as efficient as if you tried to write these yourself
// directly in your code.
// BUT... and I'm not sure why... sometimes these cause constraint counts to increase
// significantly.

/// Iterates through i,
/// where:
/// - 0 <= i < max
/// - max is only known at runtime
/// - MAX is known at compile-time, e.g. the fixed length of an array.
///
/// Lambda functions of the form `|i| { my_array[i].assert_empty() }` can be specified.
///
/// If the dev knows what they're doing, they can choose to set the following to `false`:
/// `assert_min_lte_max`, `assert_max_lte_MAX`, as a very small constraint optimisation.
pub fn for_i_in_0_<Env1, Env2>(
    max: u32,
    MAX: u32,
    f_within: fn[Env1](u32) -> (),
    f_after_max: fn[Env2](u32) -> (),
    assert_max_lte_MAX: bool,
) {
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut after_max = false;

    for i in 0..MAX {
        if i == max {
            after_max = true;
        }
        if after_max {
            f_after_max(i);
        } else {
            f_within(i);
        }
    }
}

// Strangely, this sometimes results in many more constraints than `for_i_in_0_` with
// the `for_loop_no_op` function. But other times, this one wins. I am confused.
pub fn for_i_only_in_0_<Env>(
    max: u32,
    MAX: u32,
    f_within: fn[Env](u32) -> (),
    assert_max_lte_MAX: bool,
) {
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut after_max = false;

    for i in 0..MAX {
        if i == max {
            after_max = true;
        }
        if after_max {
            ()
        } else {
            f_within(i);
        }
    }
}

/// Iterates through i,
/// where:
/// - min <= i < max
/// - min and max are only known at runtime
/// - MIN and MAX are known at compile-time, and dictate the static loop bounds.
///
/// Lambda functions of the form `|i| { my_array[i].assert_empty() }` can be specified.
///
/// If the dev knows what they're doing, they can choose to set the following to `false`:
/// `assert_min_lte_max`, `assert_max_lte_MAX`, as a very small constraint optimisation.
pub fn for_i_in_<Env1, Env2, Env3>(
    min: u32,
    max: u32,
    MIN: u32,
    MAX: u32,
    f_before_min: fn[Env1](u32) -> (),
    f_within: fn[Env2](u32) -> (),
    f_after_max: fn[Env3](u32) -> (),
    assert_min_lte_max: bool, // if the dev knows what they're doing, they can choose to set to `false` for as a small
    assert_max_lte_MAX: bool, // for if the dev knows what they're doing.
) {
    if assert_min_lte_max {
        assert(min <= max, "min > max");
    }
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut above_min = false;
    let mut below_max = true;

    for i in MIN..MAX {
        if i == min {
            above_min = true;
        }
        if i == max {
            below_max = false;
        }
        if above_min {
            if below_max {
                f_within(i);
            } else {
                f_after_max(i);
            }
        } else {
            f_before_min(i);
        }
    }
}

pub fn for_i_only_in_<Env>(
    min: u32,
    max: u32,
    MIN: u32,
    MAX: u32,
    f_within: fn[Env](u32) -> (),
    assert_min_lte_max: bool, // if the dev knows what they're doing, they can choose to set to `false` for as a small
    assert_max_lte_MAX: bool, // for if the dev knows what they're doing.
) {
    if assert_min_lte_max {
        assert(min <= max, "min > max");
    }
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut above_min = false;
    let mut below_max = true;

    for i in MIN..MAX {
        if i == min {
            above_min = true;
        }
        if i == max {
            below_max = false;
        }
        if above_min {
            if below_max {
                f_within(i);
            }
        }
    }
}

#[test]
fn test_for_i_in_0() {
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_0_(
        10,
        30,
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
    );
    assert_eq(*within_sum, 10);
    assert_eq(*after_sum, 20);
}

#[test]
fn test_for_i_only_in_0() {
    let within_sum = &mut 0;
    for_i_only_in_0_(10, 30, |_i| { *within_sum += 1; }, true);
    assert_eq(*within_sum, 10);
}

#[test]
fn test_for_i_in() {
    let before_sum = &mut 0;
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_(
        3,
        10,
        0,
        30,
        |_i| { *before_sum += 1; },
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
        true,
    );
    assert_eq(*before_sum, 3);
    assert_eq(*within_sum, 7);
    assert_eq(*after_sum, 20);
}

#[test]
fn test_for_i_only_in() {
    let within_sum = &mut 0;
    for_i_only_in_(3, 10, 0, 30, |_i| { *within_sum += 1; }, true, true);
    assert_eq(*within_sum, 7);
}

#[test(should_fail_with = "min > max")]
fn test_min_gt_max_fails_for_i_in() {
    let before_sum = &mut 0;
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_(
        10,
        9,
        0,
        20,
        |_i| { *before_sum += 1; },
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
        true,
    );
}

#[test(should_fail_with = "min > max")]
fn test_min_gt_max_fails_for_i_in_2() {
    let before_sum = &mut 0;
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_(
        10,
        9,
        0,
        9,
        |_i| { *before_sum += 1; },
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
        true,
    );
}

#[test(should_fail_with = "max > MAX")]
fn test_max_gt_MAX_fails_for_i_in() {
    let before_sum = &mut 0;
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_(
        10,
        20,
        0,
        19,
        |_i| { *before_sum += 1; },
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
        true,
    );
}

#[test(should_fail_with = "max > MAX")]
fn test_max_gt_MAX_fails_for_i_in_0() {
    let within_sum = &mut 0;
    let after_sum = &mut 0;
    for_i_in_0_(
        20,
        19,
        |_i| { *within_sum += 1; },
        |_i| { *after_sum += 1; },
        true,
    );
}

#[test]
fn test_array_copy_for_i_in() {
    let dest = [1, 1, 1, 1, 1, 1, 2, 2];
    let source = [2, 2, 0, 0];
    let source_length = 2;
    // We'll try to assert that some of source is copied to the last 3 elements of dest
    let copy_from_index = 6;
    for_i_in_0_(
        source_length,
        source.len(),
        |i| { assert(dest[copy_from_index + i] == source[i]); },
        for_loop_no_op,
        true,
    );
}

#[test(should_fail_with = "Index out of bounds")]
fn test_array_copy_fails_for_i_in() {
    let dest = [1, 1, 1, 1, 1, 1, 2, 2];
    let source = [2, 2, 2, 2];
    let source_length = 4;
    // We'll try to assert that some of source is copied to the last elements of dest,
    // but it should fail because there isn't enough room
    let copy_from_index = 6;
    for_i_in_0_(
        source_length,
        source.len(),
        |i| { assert(dest[copy_from_index + i] == source[i]); },
        for_loop_no_op,
        true,
    );
}
