pub global for_loop_no_op: fn(u32) -> () = |_i: u32| ();

// Sometimes these are exactly as efficient as if you tried to write these yourself
// directly in your code.
// BUT... and I'm not sure why... sometimes these cause constraint counts to increase
// significantly.

/**
 * Iterates between loop bounds and conditionally executes functions according to the below explanation,
 * where:
 * - `max` is a dynamic loop bound (known only at runtime).
 * - `MAX` is a static loop bound (known at compile time).
 *     
 * 0 ------   
 *
 *            f_within is executed for 0 <= i < max    
 * 
 * <=
 * max ------
 *
 *            f_after_max is executed for max <= i < MAX  
 *
 * <=
 * MAX ------
 *
 *
 *
 * Lambda functions of the form `|i| { my_array[i].assert_empty() }` (for example) can be specified.
 * 
 */
pub fn for_i_in_0_<ENV1, ENV2>(
    max: u32,
    MAX: u32,
    f_within: fn[ENV1](u32) -> (),
    f_after_max: fn[ENV2](u32) -> (),
    // If the dev knows what they're doing, they can choose to set the below bool
    // to `false` for a small constraint reduction.
    assert_max_lte_MAX: bool,
) {
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut after_max = false;

    for i in 0..MAX {
        after_max |= i == max;

        if after_max {
            f_after_max(i);
        } else {
            f_within(i);
        }
    }
}

/**
 * Iterates between loop bounds and conditionally executes a function for min <= i < max,
 * where:
 * - `max` is a dynamic loop bound (known only at runtime).
 * - `MAX` is a static loop bound (known at compile time).
 *     
 * 0 ------ 
 *
 *            f_within is executed for 0 <= i < max    
 * 
 * <=
 * max ------
 * <=
 * MAX ------
 *
 *
 * Lambda functions of the form `|i| { my_array[i].assert_empty() }` (for example) can be specified.
 *
 * Strangely, this sometimes results in many more constraints than `for_i_in_0_` with
 * the `for_loop_no_op` function. But other times, this one wins. I am confused.
 */
pub fn for_i_only_in_0_<ENV>(
    max: u32,
    MAX: u32,
    f_within: fn[ENV](u32) -> (),
    // If the dev knows what they're doing, they can choose to set the below bool
    // to `false` for a small constraint reduction.
    assert_max_lte_MAX: bool,
) {
    if assert_max_lte_MAX {
        assert(max <= MAX, "max > MAX");
    }

    let mut before_max = true;
    for i in 0..MAX {
        if i == max {
            before_max = false;
        }
        if before_max {
            f_within(i);
        }
    }
}

/**
 * Iterates between loop bounds and conditionally executes functions according to the below 
 * explanation, where:
 * - `min` and `max` are dynamic loop bounds (known only at runtime).
 * - `MIN` and `MAX` are static loop bounds (known at compile time).
 *
 * MIN ------
 *
 *            f_before_min is executed for MIN <= i < min   
 *
 * <=       
 * min ------ 
 *
 *            f_within is executed for min <= i < max    
 * 
 * <=
 * max ------
 *
 *            f_after_max is executed for max <= i < MAX  
 *
 * <=
 * MAX ------
 *
 *
 * Lambda functions of the form `|i| { my_array[i].assert_empty() }` (for example) can be specified.
 * 
 */
pub fn for_i_in_<ENV1, ENV2, ENV3>(
    min: u32,
    max: u32,
    MIN: u32,
    MAX: u32,
    f_before_min: fn[ENV1](u32) -> (),
    f_within: fn[ENV2](u32) -> (),
    f_after_max: fn[ENV3](u32) -> (),
    // If the dev knows what they're doing, they can choose to set either or both of the below bools
    // to `false` for a small constraint reduction.
    assert_min_lte_max: bool,
    assert_max_lte_MAX: bool,
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

/**
 * Iterates between loop bounds and conditionally executes a function for min <= i < max,
 * where:
 * - `min` and `max` are dynamic loop bounds (known only at runtime).
 * - `MIN` and `MAX` are static loop bounds (known at compile time).
 *
 * MIN ------
 * <=       
 * min ------ 
 *
 *            f_within is executed for min <= i < max    
 * 
 * <=
 * max ------
 * <=
 * MAX ------
 *
 *
 * @param f_within: Lambda functions of the form `|i| { my_array[i].assert_empty() }` (for example) can be specified.
 * 
 */
pub fn for_i_only_in_<ENV>(
    min: u32,
    max: u32,
    MIN: u32,
    MAX: u32,
    f_within: fn[ENV](u32) -> (),
    // If the dev knows what they're doing, they can choose to set either or both of the below bools
    // to `false` for a small constraint reduction.
    assert_min_lte_max: bool,
    assert_max_lte_MAX: bool,
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
