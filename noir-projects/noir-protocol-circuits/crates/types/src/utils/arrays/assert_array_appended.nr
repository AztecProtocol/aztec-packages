use crate::{
    abis::side_effect::{Scoped as ScopedTrait, scoped::Scoped},
    address::aztec_address::AztecAddress,
    traits::Empty,
    utils::{
        arrays::{AppendedUnvalidatedArray, EmptyRHSArray},
        for_loop::{for_i_in_0_, for_i_only_in_, for_loop_no_op},
    },
};

pub fn assert_array_appended_to_empty_dest<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<T, N>,
    source: EmptyRHSArray<T, M>,
)
where
    T: Empty,
{
    std::static_assert(M < N, "Source array larger than dest array");
    for i in 0..M {
        assert_eq(dest.array[i], source.array[i], "source item does not append to dest");
    }
    assert_eq(dest.length, source.length);
}

// Similar to assert_array_appended, except that the source items will be appended to dest in reversed order.
pub fn assert_array_appended_reversed_to_empty_dest<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<T, N>,
    source: EmptyRHSArray<T, M>,
)
where
    T: Empty,
{
    std::static_assert(M < N, "Source array larger than dest array");
    for i in 0..M {
        let j = M - i - 1;
        assert_eq(dest.array[i], source.array[j], "source item does not reversed append to dest");
    }

    assert_eq(dest.length, source.length);
}

// An optimisation that assumes the dest array is empty, so the dest indices that we access can be known at comptime.
pub fn assert_array_appended_to_empty_dest_scoped<ST, T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<ST, N>,
    source: EmptyRHSArray<T, M>,
    contract_address: AztecAddress,
)
where
    ST: ScopedTrait<T> + Empty,
    T: Eq,
{
    std::static_assert(M < N, "Source array larger than dest array");
    for i in 0..M {
        assert_eq(dest.array[i].inner(), source.array[i], "source item does not append to dest");
    }

    // We only conditionally check the contract addresses.
    // TODO: push the contract addresses to the elements beyond the length, because it doesn't matter.
    for_i_in_0_(
        source.length,
        source.array.len(),
        |i| {
            assert_eq(
                dest.array[i].contract_address(),
                contract_address,
                "propagated contract address does not match",
            );
        },
        for_loop_no_op,
        false,
    );

    assert_eq(dest.length, source.length);
}

pub fn assert_array_appended_to_empty_dest_and_scoped<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<Scoped<T>, N>,
    source: EmptyRHSArray<T, M>,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");
    for i in 0..M {
        assert_eq(dest.array[i].inner, source.array[i], "source item does not append to dest");
    }

    // We only conditionally check the contract addresses.
    // TODO: push the contract addresses to the elements beyond the length, because it doesn't matter.
    for_i_in_0_(
        source.length,
        source.array.len(),
        |i| {
            assert_eq(
                dest.array[i].contract_address,
                contract_address,
                "propagated contract address does not match",
            );
        },
        for_loop_no_op,
        false,
    );

    assert_eq(dest.length, source.length);
}

pub fn assert_array_appended<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<T, N>,
    source: EmptyRHSArray<T, M>,
    num_prepended_items: u32,
)
where
    T: Empty,
{
    for_i_in_0_(
        source.length,
        source.array.len(),
        |i| {
            // If d is out of bounds, then Noir will break and the proof can't be generated.
            // If that's not true (and a malicious proof could still be generated), then
            // reinstate the commented-out `if` statement above.
            assert_eq(
                dest.array[num_prepended_items + i],
                source.array[i],
                "source item does not append to dest",
            );
        },
        for_loop_no_op,
        false,
    );

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}

// Similar to assert_array_appended, except that the source items will be appended to dest in reversed order.
pub fn assert_array_appended_reversed_up_to_some_length<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<T, N>,
    source: EmptyRHSArray<T, M>,
    num_prepended_items: u32,
)
where
    T: Empty,
{
    let items_propagated = num_prepended_items + source.length;

    // Interestingly, unlike the other functions in this file,
    // for this reverse loop, it's more efficient to iterate over the whole
    // dest array, and access that array's index statically, than to
    // iterate over the much smaller source array and access that array's index
    // dynamically. This isn't the case for the other functions.
    for_i_only_in_(
        num_prepended_items,
        items_propagated,
        0,
        dest.array.len(),
        |i| {
            assert_eq(
                dest.array[i],
                source.array[items_propagated - i - 1],
                "source item does not reversed append to dest",
            );
        },
        false,
        true,
    );
}

// Similar to assert_array_appended, except that the contract address of the dest items will also be checked.
pub fn assert_array_appended_scoped<ST, T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<ST, N>,
    source: EmptyRHSArray<T, M>,
    num_prepended_items: u32,
    contract_address: AztecAddress,
)
where
    ST: ScopedTrait<T> + Empty,
    T: Empty,
{
    for_i_in_0_(
        source.length,
        source.array.len(),
        |i| {
            assert_eq(
                dest.array[num_prepended_items + i].inner(),
                source.array[i],
                "source item does not append to dest",
            );
            assert_eq(
                dest.array[num_prepended_items].contract_address(),
                contract_address,
                "propagated contract address does not match",
            );
        },
        for_loop_no_op,
        false,
    );

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}

// Similar to assert_array_appended, except that the contract address of the dest items will also be checked.
// Slightly different from `assert_array_appended_scoped`: the `dest` properties are accessed directly instead of via getters.
pub fn assert_array_appended_and_scoped<T, let N: u32, let M: u32>(
    dest: AppendedUnvalidatedArray<Scoped<T>, N>,
    source: EmptyRHSArray<T, M>,
    num_prepended_items: u32,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    for_i_in_0_(
        source.length,
        source.array.len(),
        |i| {
            assert_eq(
                dest.array[num_prepended_items + i].inner,
                source.array[i],
                "source item does not append to dest",
            );
            assert_eq(
                dest.array[num_prepended_items].contract_address,
                contract_address,
                "propagated contract address does not match",
            );
        },
        for_loop_no_op,
        false,
    );

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}
