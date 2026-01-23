use types::{
    address::aztec_address::AztecAddress, side_effect::Scoped, traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

// ****** INIT KERNEL ******

pub fn append_to_empty_dest<T, let N: u32, let M: u32>(
    dest: &mut ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, M>,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    // We blindly copy all data from the source to the dest, regardless of the dynamic `source.length`.
    // A malicious app could technically try to sneak-in nonempty data after the source.length and it
    // would be copied. But... the dest.length is incremented by source.length.
    // In the next kernel iteration, we will copy the next source items from the starting dest.length position,
    // so we would overwrite any malicious items beyond the starting dest.length.
    // If this is the last kernel iteration, the tail circuit will iterate over the `dest` and assert
    // that everything beyond the dest.length is indeed empty, thereby catching any malicious data beyond
    // the final dest.length.

    for i in 0..M {
        dest.array[i] = source.array[i];
    }
    dest.length = source.length;
}

pub fn append_and_scope_to_empty_dest<T, let N: u32, let M: u32>(
    dest: &mut ClaimedLengthArray<Scoped<T>, N>,
    source: ClaimedLengthArray<T, M>,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    // We blindly copy all data from the source to the dest, regardless of the dynamic `source.length`.
    // A malicious app could technically try to sneak-in nonempty data after the source.length and it
    // would be copied. But... the dest.length is incremented by source.length.
    // In the next kernel iteration, we will copy the next source items from the starting dest.length position,
    // so we would overwrite any malicious items beyond the starting dest.length.
    // If this is the last kernel iteration, the tail circuit will iterate over the `dest` and assert
    // that everything beyond the dest.length is indeed empty, thereby catching any malicious data beyond
    // the final dest.length.
    for i in 0..M {
        dest.array[i].inner = source.array[i];
    }

    // Notice: we don't blindly copy the `contract_address` items from all indices of the source to the
    // dest.
    let mut should_copy = true;
    for i in 0..M {
        should_copy &= i != source.length;
        if should_copy {
            dest.array[i].contract_address = contract_address;
        };
    }

    dest.length = source.length;
}

// This only exists for the quirk of the first nullifier of a tx conditionally being a
// protocol nullifier (injected by the private kernel init).
pub fn append_and_scope_to_index_0_or_1<T, let N: u32, let M: u32>(
    dest: &mut ClaimedLengthArray<Scoped<T>, N>,
    source: ClaimedLengthArray<T, M>,
    insert_at_index_1: bool, // inserts at `0` if false
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    // This inequality is strict, to ensure there's always 1 extra index in the dest array, due to
    // how we lazily construct both possible output dest arrays below. There currently isn't a configuration
    // of Init circuit for which the number of nullifiers from a call matches the number propagated
    // by the kernel. If that changes, this static assertion will bite, and you'll need to update the
    // way this function conditionally assigns to either index 0 or 1.
    std::static_assert(M < N, "Source array larger than dest array");

    // We compute both possible `dest` results, and then conditionally assign the whole array.
    let mut dest0 = ClaimedLengthArray::<Scoped<T>, N>::empty();

    for i in 0..M {
        dest0.array[i].inner = source.array[i];
    }

    let mut should_copy = true;
    for i in 0..M {
        should_copy &= i != source.length;
        if should_copy {
            dest0.array[i].contract_address = contract_address;
        };
    }

    let mut dest1 = ClaimedLengthArray::<Scoped<T>, N>::empty();

    dest1.array[0] = dest.array[0];
    for i in 0..M {
        dest1.array[i + 1] = dest0.array[i];
    }

    if insert_at_index_1 {
        assert_eq(dest.length, 1, "Expected dest to have length 1");
    } else {
        assert_eq(dest.length, 0, "Expected dest to have length 0");
    }

    dest.array = if insert_at_index_1 {
        dest1.array
    } else {
        dest0.array
    };

    // We _increment_ (rather than assign) because the dest.length could already be 1 (rather than 0).
    dest.length += source.length;
}

/// Validates that source items are appended in reversed order to an empty destination array.
pub fn append_reversed_to_empty_dest<T, let N: u32, let M: u32>(
    dest: &mut ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, M>,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    let mut should_copy = true;
    for i in 0..M {
        should_copy &= i != source.length;
        if should_copy {
            dest.array[i] = source.array[source.length - 1 - i];
        }
    }

    dest.length = source.length;
}

// ****** INNER KERNEL ******

/// Validates that source items are appended after `num_prepended_items` prepended items in the destination array.
pub fn assert_array_appended<T, let N: u32, let M: u32>(
    dest: ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, M>,
    num_prepended_items: u32,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    // We check that items within source.length are appended to the dest array, after the prepended items.
    // Items beyond the new dest.length (num_prepended_items + source.length) are ignored.
    // A malicious user could technically try to sneak-in nonempty items after the new dest.length and it would not be
    // caught by this function.
    // However, in the next kernel iteration, we will copy the next source items from the starting dest.length position,
    // so we would overwrite any malicious items beyond the starting dest.length.
    // If this is the last kernel iteration, the tail circuit will iterate over the `dest` and assert that everything
    // beyond the dest.length is indeed empty, thereby catching any malicious data beyond the final dest.length.
    //
    // Note: we can't blindly copy every element from the source to the dest, and instead we have to
    // adopt the conditional logic of this for_each_i loop, because we want to enable the case where
    // `num_prepended_items + source.length <= dest.len()` even if
    // `num_prepended_items + source.len() > dest.len()`.
    source.for_each_i(|source_item, i| {
        assert_eq(
            dest.array[num_prepended_items + i],
            source_item,
            "source item does not append to dest",
        );
    });

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}

/// Validates that source items are appended in reversed order after `num_prepended_items` prepended items.
/// Note: we do not reverse and append the entire `source` array: we only reverse the items up to
/// the `source.length`, and then append that reversed subarray.
pub fn assert_array_appended_reversed<T, let N: u32, let M: u32>(
    dest: ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, M>,
    num_prepended_items: u32,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    let items_propagated = num_prepended_items + source.length;

    source.for_each_i(|source_item, i| {
        assert_eq(
            dest.array[items_propagated - i - 1],
            source_item,
            "source item does not reversed append to dest",
        );
    });

    assert_eq(items_propagated, dest.length, "Length mismatch");
}

/// Validates that source items are appended after `num_prepended_items` prepended items and scoped with a contract
/// address.
pub fn assert_array_appended_and_scoped<T, let N: u32, let M: u32>(
    dest: ClaimedLengthArray<Scoped<T>, N>,
    source: ClaimedLengthArray<T, M>,
    num_prepended_items: u32,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    source.for_each_i(|source_item, i| {
        let dest_item = dest.array[num_prepended_items + i];
        assert_eq(dest_item.inner, source_item, "source item does not append to dest");
        assert_eq(
            dest_item.contract_address,
            contract_address,
            "propagated contract address does not match",
        );
    });

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}

mod tests {
    use super::{
        append_and_scope_to_empty_dest, append_and_scope_to_index_0_or_1,
        append_reversed_to_empty_dest, append_to_empty_dest, assert_array_appended,
        assert_array_appended_and_scoped, assert_array_appended_reversed,
    };
    use types::{
        address::aztec_address::AztecAddress,
        side_effect::Scoped,
        tests::utils::make_fixture,
        traits::{Empty, FromField},
        utils::arrays::ClaimedLengthArray,
    };

    // ==================== append_to_empty_dest tests ====================

    #[test]
    fn append_to_empty_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_to_empty_dest(&mut dest, source);

        assert_eq(dest.array, [10, 20, 30, 0, 0]);
        assert_eq(dest.length, 3);
    }

    #[test]
    fn append_to_empty_dest_partial_length_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_to_empty_dest(&mut dest, source);

        assert_eq(dest.array, [10, 20, 0, 0, 0]);
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_to_empty_dest_items_beyond_length_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_to_empty_dest(&mut dest, source);

        // Notice: this exhibits the counter-intuitive optimisation where items are
        // blindly copied from source, regardless of the source length.
        // A later circuit will validate the claimed length of the ClaimedLengthArray (and
        // in this case that later circuit would reject this array because there is a nonzero 30 after the dest length).
        assert_eq(dest.array, [10, 20, 30, 0, 0]);
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_to_empty_dest_overwrites_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 0], length: 2 };
        // Naughty dest:
        let mut dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [50, 60, 70, 0, 0], length: 2 };

        append_to_empty_dest(&mut dest, source);

        // Notice: this exhibits the counter-intuitive optimisation where items are
        // blindly copied from source, regardless of the source length.
        // A later circuit will validate the claimed length of the ClaimedLengthArray (and
        // in this case that later circuit would reject this array because there is a nonzero 30 after the dest length).
        assert_eq(dest.array, [10, 20, 30, 0, 0]);
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_to_empty_dest_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_to_empty_dest(&mut dest, source);

        assert_eq(dest.array, [0, 0, 0, 0, 0]);
        assert_eq(dest.length, 0);
    }

    // ==================== append_and_scope_to_empty_dest tests ====================

    #[test]
    fn append_and_scope_to_empty_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_empty_dest(&mut dest, source, contract_address);

        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        assert_eq(dest.array[2].inner, 30);
        assert_eq(dest.array[2].contract_address, contract_address);
        assert_eq(dest.length, 3);
    }

    #[test]
    fn append_and_scope_to_empty_dest_partial_length_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_empty_dest(&mut dest, source, contract_address);

        // Items within length get the contract address
        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        // Items beyond length get empty contract address
        assert_eq(dest.array[2].inner, 0);
        assert_eq(dest.array[2].contract_address, AztecAddress::empty());
        assert_eq(dest.array[3].inner, 0);
        assert_eq(dest.array[3].contract_address, AztecAddress::empty());
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_and_scope_to_empty_dest_items_beyond_length_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_empty_dest(&mut dest, source, contract_address);

        // Notice: this exhibits the counter-intuitive optimisation where items are
        // blindly copied from source, regardless of the source length.
        // A later circuit will validate the claimed length of the ClaimedLengthArray (and
        // in this case that later circuit would reject this array because there is a nonzero 30 after the dest length).
        //
        // Notice: the contract_addresses are empty beyond the length.

        // Items within length get the contract address
        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        // Items beyond length get empty contract address
        assert_eq(dest.array[2].inner, 30);
        assert_eq(dest.array[2].contract_address, AztecAddress::empty());
        assert_eq(dest.array[3].inner, 0);
        assert_eq(dest.array[3].contract_address, AztecAddress::empty());
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_and_scope_to_empty_dest_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_empty_dest(&mut dest, source, contract_address);

        assert_eq(dest.length, 0);
        // All items should have empty contract address
        assert_eq(dest.array[0].contract_address, AztecAddress::empty());
    }

    #[test]
    fn append_and_scope_to_empty_dest_overwrites_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 0], length: 2 };
        // Naughty dest:
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray {
            array: [
                Scoped { inner: 50, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 60, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 70, contract_address: AztecAddress::from_field(333) },
                Scoped::empty(),
                Scoped::empty(),
            ],
            length: 2,
        };
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_empty_dest(&mut dest, source, contract_address);

        // Items within length get the contract address and are overwritten
        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        // For items beyond length: inner is blindly copied, but contract_address is NOT set (remains from dest)
        // So for i >= source.length, the contract_address is whatever `dest` initially had.
        // Obviously, that's bad (items for i >= source.length should be empty), but this is
        // an optimization, and the items that should be empty will get caught in the Tail circuit.
        assert_eq(dest.array[2].inner, 30);
        assert_eq(dest.array[2].contract_address, AztecAddress::from_field(333));
        assert_eq(dest.length, 2);
    }

    // ==================== append_and_scope_to_index_0_or_1 tests ====================

    #[test]
    fn append_and_scope_to_index_0_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, false, contract_address);

        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        assert_eq(dest.array[2].inner, 30);
        assert_eq(dest.array[2].contract_address, contract_address);
        assert_eq(dest.length, 3);
    }

    #[test]
    fn append_and_scope_to_index_1_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        dest.length = 1; // Protocol nullifier slot reserved
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, true, contract_address);

        // Index 0 is empty (reserved for protocol nullifier)
        assert_eq(dest.array[0].inner, 0);
        assert_eq(dest.array[0].contract_address, AztecAddress::empty());
        // Items start at index 1
        assert_eq(dest.array[1].inner, 10);
        assert_eq(dest.array[1].contract_address, contract_address);
        assert_eq(dest.array[2].inner, 20);
        assert_eq(dest.array[2].contract_address, contract_address);
        assert_eq(dest.array[3].inner, 30);
        assert_eq(dest.array[3].contract_address, contract_address);
        assert_eq(dest.length, 4); // 1 + 3
    }

    #[test]
    fn append_and_scope_to_index_1_with_existing_length_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        dest.length = 1; // Simulates protocol nullifier already present
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, true, contract_address);

        // Length is incremented by source.length
        assert_eq(dest.length, 3); // 1 + 2
    }

    #[test]
    fn append_and_scope_to_index_0_items_beyond_length_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 2 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, false, contract_address);

        // Items within length get the contract address
        assert_eq(dest.array[0].inner, 10);
        assert_eq(dest.array[0].contract_address, contract_address);
        assert_eq(dest.array[1].inner, 20);
        assert_eq(dest.array[1].contract_address, contract_address);
        // Item beyond length is copied but gets empty contract address
        assert_eq(dest.array[2].inner, 30);
        assert_eq(dest.array[2].contract_address, AztecAddress::empty());
        assert_eq(dest.length, 2);
    }

    #[test(should_fail_with = "Expected dest to have length 1")]
    fn append_and_scope_to_index_1_with_wrong_dest_length_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        // dest.length is 0, but insert_at_index_1 = true expects length 1
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, true, contract_address);
    }

    #[test(should_fail_with = "Expected dest to have length 0")]
    fn append_and_scope_to_index_0_with_wrong_dest_length_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        dest.length = 1; // dest.length is 1, but insert_at_index_1 = false expects length 0
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, false, contract_address);
    }

    #[test]
    fn append_and_scope_to_index_0_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, false, contract_address);

        assert_eq(dest.length, 0);
    }

    #[test]
    fn append_and_scope_to_index_1_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let mut dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray::empty();
        let first_nullifier = make_fixture(99);
        dest.array[0] = first_nullifier;
        dest.length = 1; // Protocol nullifier slot reserved
        let contract_address = AztecAddress::from_field(999);

        append_and_scope_to_index_0_or_1(&mut dest, source, true, contract_address);

        // Length should remain 1 (no items added from empty source)
        assert_eq(dest.length, 1);
        // The first nullifier should remain the same
        assert_eq(dest.array[0], first_nullifier);
    }

    // ==================== append_reversed_to_empty_dest tests ====================

    #[test]
    fn append_reversed_to_empty_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_reversed_to_empty_dest(&mut dest, source);

        // Items are reversed: last source item becomes first dest item
        assert_eq(dest.array[0], 30);
        assert_eq(dest.array[1], 20);
        assert_eq(dest.array[2], 10);
        assert_eq(dest.length, 3);
    }

    #[test]
    fn append_reversed_to_empty_dest_partial_length_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_reversed_to_empty_dest(&mut dest, source);

        // Only items within length are reversed
        assert_eq(dest.array[0], 20);
        assert_eq(dest.array[1], 10);
        assert_eq(dest.array[2], 0);
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_reversed_to_empty_dest_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_reversed_to_empty_dest(&mut dest, source);

        assert_eq(dest.array, [0, 0, 0, 0, 0]);
        assert_eq(dest.length, 0);
    }

    #[test]
    fn append_reversed_to_empty_dest_single_item_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [42, 0, 0], length: 1 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_reversed_to_empty_dest(&mut dest, source);

        assert_eq(dest.array[0], 42);
        assert_eq(dest.length, 1);
    }

    #[test]
    fn append_reversed_to_empty_dest_items_beyond_length_zeroed() {
        // Unlike append_to_empty_dest, this function explicitly zeroes items beyond the length
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 40], length: 2 };
        let mut dest: ClaimedLengthArray<Field, 5> = ClaimedLengthArray::empty();

        append_reversed_to_empty_dest(&mut dest, source);

        // Only items within length are reversed
        assert_eq(dest.array[0], 20);
        assert_eq(dest.array[1], 10);
        // Items beyond length are explicitly set to empty (not blindly copied)
        assert_eq(dest.array[2], 0);
        assert_eq(dest.array[3], 0);
        assert_eq(dest.length, 2);
    }

    #[test]
    fn append_reversed_to_empty_dest_overwrites_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 30, 0], length: 2 };
        // Naughty dest:
        let mut dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [50, 60, 70, 80, 0], length: 3 };

        append_reversed_to_empty_dest(&mut dest, source);

        // Items within length are reversed and overwrite existing values
        assert_eq(dest.array[0], 20);
        assert_eq(dest.array[1], 10);
        // Items beyond length are NOT touched (unlike append_to_empty_dest which blindly copies)
        // So they retain the original dest values
        assert_eq(dest.array[2], 70);
        assert_eq(dest.array[3], 80);
        assert_eq(dest.length, 2); // The dest length is revised to be correct.
    }

    // ==================== assert_array_appended tests ====================

    #[test]
    fn assert_array_appended_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 5 };

        assert_array_appended(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_no_prepended_items_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [10, 20, 30, 0, 0], length: 3 };

        assert_array_appended(dest, source, 0);
    }

    #[test]
    fn assert_array_appended_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0], length: 2 };

        assert_array_appended(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_with_items_beyond_source_length_succeeds() {
        // This test exibits the counter-intuitive optimisation where items beyond the source length will still get copied,
        // but the dest length will ignore them.
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 2 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 4 };

        assert_array_appended(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_with_capacity_for_source_length_but_not_source_len_succeeds() {
        // This test illustrates why we need conditional copying of items.
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [50, 60, 0, 0], length: 2 };
        // Notice: there is not enough capacity in dest for source.len(), but there is enough
        // capacity for source.length.
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 60], length: 6 };

        assert_array_appended(dest, source, 4);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn assert_array_appended_with_insufficient_dest_capacity_fails() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [60, 70, 0, 0], length: 2 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 60], length: 6 };

        // Given 5 prepended items already, there's only space for 1 more item.
        assert_array_appended(dest, source, 5);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn assert_array_appended_with_insufficient_dest_capacity_and_invalid_dest_length_fails() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [60, 70, 0, 0], length: 2 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 60], length: 7 }; // 7 is too big!

        // Given 5 prepended items already, there's only space for 1 more item.
        // Note: we'll hit an out of bounds error before the length assertion.
        assert_array_appended(dest, source, 5);
    }

    #[test(should_fail_with = "source item does not append to dest")]
    fn assert_array_appended_mismatch_value_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 99, 50, 0], length: 5 }; // 99 instead of 40

        assert_array_appended(dest, source, 2);
    }

    #[test(should_fail_with = "Length mismatch")]
    fn assert_array_appended_length_mismatch_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 4 }; // length should be 5

        assert_array_appended(dest, source, 2);
    }

    #[test(should_fail_with = "source item does not append to dest")]
    fn assert_array_appended_wrong_num_prepended_items_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 5 };

        // Wrong offset: says 1 prepended item, but actually 2
        // This causes comparison at wrong indices: dest[1]=20 vs source[0]=30
        assert_array_appended(dest, source, 1);
    }

    #[test]
    fn assert_array_appended_items_full_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Dest array of size 4, num_prepended_items + source.length = 1 + 3 = 4 exactly fills dest
        let dest: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 30, 40, 50], length: 4 };

        assert_array_appended(dest, source, 1);
    }

    // ==================== assert_array_appended_reversed tests ====================

    #[test]
    fn assert_array_appended_reversed_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Reversed: 50, 40, 30
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 50, 40, 30, 0], length: 5 };

        assert_array_appended_reversed(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_reversed_no_prepended_items_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        // Reversed: 30, 20, 10
        let dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [30, 20, 10, 0, 0], length: 3 };

        assert_array_appended_reversed(dest, source, 0);
    }

    #[test]
    fn assert_array_appended_reversed_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let dest: ClaimedLengthArray<Field, 5> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0], length: 2 };

        assert_array_appended_reversed(dest, source, 2);
    }

    #[test(should_fail_with = "source item does not reversed append to dest")]
    fn assert_array_appended_reversed_mismatch_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Not reversed properly
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 5 };

        assert_array_appended_reversed(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_reversed_only_validates_within_source_length() {
        // This function only validates items within source.length.
        // Items beyond source.length in dest are not checked.
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 2 };
        // Reversed within length: 40, 30. Item at source[2]=50 is not validated.
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 40, 30, 99, 0], length: 4 };
        // Note: dest[4]=99 doesn't match anything, but it's outside the validated range

        assert_array_appended_reversed(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_reversed_with_capacity_for_source_length_but_not_source_len_succeeds() {
        // This test illustrates why we need conditional copying of items.
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [50, 60, 0, 0], length: 2 };
        // Notice: there is not enough capacity in dest for source.len(), but there is enough
        // capacity for source.length.
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 60, 50], length: 6 };

        assert_array_appended_reversed(dest, source, 4);
    }

    #[test(should_fail_with = "Length mismatch")]
    fn assert_array_appended_reversed_length_mismatch_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Reversed: 50, 40, 30
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 50, 40, 30, 0], length: 4 }; // length should be 5

        assert_array_appended_reversed(dest, source, 2);
    }

    #[test(should_fail_with = "source item does not reversed append to dest")]
    fn assert_array_appended_reversed_wrong_num_prepended_items_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Reversed: 50, 40, 30 starting at index 2 (correct for offset=2)
        // Naughty dest length:
        let dest: ClaimedLengthArray<Field, 7> =
            ClaimedLengthArray { array: [10, 20, 50, 40, 30, 0, 0], length: 6 };

        // Wrong offset: says 3 prepended items, but actually 2
        // Length check passes: 3 + 3 = 6 == dest.length
        // But items don't match: dest[3]=40 vs source[5-3-1]=source[2]=50
        assert_array_appended_reversed(dest, source, 3);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn assert_array_appended_reversed_items_exceed_dest_length_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Dest array of size 4, but num_prepended_items + source.length = 2 + 3 = 5 > 4
        let dest: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 20, 40, 30], length: 4 };

        // This should fail because 3 prepended + 3 source = 6 exceeds dest array size of 4
        assert_array_appended_reversed(dest, source, 2);
    }

    #[test]
    fn assert_array_appended_reversed_items_full_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        // Dest array of size 4, num_prepended_items + source.length = 1 + 3 = 4 can fit all items
        let dest: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [10, 50, 40, 30], length: 4 };

        assert_array_appended_reversed(dest, source, 1);
    }

    // ==================== assert_array_appended_and_scoped tests ====================

    #[test]
    fn assert_array_appended_and_scoped_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address },
                Scoped { inner: 50, contract_address },
                Scoped::empty(),
            ],
            length: 5,
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test]
    fn assert_array_appended_and_scoped_no_prepended_items_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address },
                Scoped { inner: 20, contract_address },
                Scoped { inner: 30, contract_address },
                Scoped::empty(),
                Scoped::empty(),
            ],
            length: 3,
        };

        assert_array_appended_and_scoped(dest, source, 0, contract_address);
    }

    #[test]
    fn assert_array_appended_and_scoped_empty_source_succeeds() {
        let source: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 5> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
            ],
            length: 2,
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test]
    fn assert_array_appended_and_scoped_only_validates_within_source_length() {
        // This function only validates items within source.length.
        // Items beyond source.length in dest are not checked.
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 2 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address },
                // Note: dest[4] doesn't match source[2]=50, but it's not validated
                // because source.length is only 2
                Scoped { inner: 99, contract_address },
                Scoped::empty(),
            ],
            length: 4,
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test]
    fn assert_array_appended_and_scoped_with_capacity_for_source_length_but_not_source_len_succeeds() {
        // This test illustrates why we need conditional copying of items.
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [50, 60, 0, 0], length: 2 };
        let contract_address = AztecAddress::from_field(999);

        // Notice: there is not enough capacity in dest for source.len(), but there is enough
        // capacity for source.length.

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address: AztecAddress::from_field(333) },
                Scoped { inner: 40, contract_address: AztecAddress::from_field(444) },
                Scoped { inner: 50, contract_address },
                Scoped { inner: 60, contract_address },
            ],
            length: 6,
        };

        assert_array_appended_and_scoped(dest, source, 4, contract_address);
    }

    #[test(should_fail_with = "source item does not append to dest")]
    fn assert_array_appended_and_scoped_mismatch_value_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 99, contract_address }, // 99 instead of 40
                Scoped { inner: 50, contract_address },
                Scoped::empty(),
            ],
            length: 5,
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test(should_fail_with = "propagated contract address does not match")]
    fn assert_array_appended_and_scoped_mismatch_contract_address_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let contract_address = AztecAddress::from_field(999);
        let wrong_address = AztecAddress::from_field(888);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address: wrong_address }, // wrong address
                Scoped { inner: 50, contract_address },
                Scoped::empty(),
            ],
            length: 5,
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test(should_fail_with = "Length mismatch")]
    fn assert_array_appended_and_scoped_length_mismatch_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address },
                Scoped { inner: 50, contract_address },
                Scoped::empty(),
            ],
            length: 4, // should be 5
        };

        assert_array_appended_and_scoped(dest, source, 2, contract_address);
    }

    #[test(should_fail_with = "source item does not append to dest")]
    fn assert_array_appended_and_scoped_wrong_num_prepended_items_fails() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address },
                Scoped { inner: 50, contract_address },
                Scoped::empty(),
            ],
            length: 5,
        };

        // Wrong offset: says 1 prepended item, but actually 2
        // This causes comparison at wrong indices: dest[1].inner=20 vs source[0]=30
        assert_array_appended_and_scoped(dest, source, 1, contract_address);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn assert_array_appended_and_scoped_with_insufficient_dest_capacity_fails() {
        let source: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [60, 70, 0, 0], length: 2 };
        let contract_address = AztecAddress::from_field(999);

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address: AztecAddress::from_field(222) },
                Scoped { inner: 30, contract_address: AztecAddress::from_field(333) },
                Scoped { inner: 40, contract_address: AztecAddress::from_field(444) },
                Scoped { inner: 50, contract_address: AztecAddress::from_field(555) },
                Scoped { inner: 60, contract_address },
            ],
            length: 6,
        };

        // Given 5 prepended items already, there's only space for 1 more item.
        assert_array_appended_and_scoped(dest, source, 5, contract_address);
    }

    #[test]
    fn assert_array_appended_and_scoped_items_full_dest_succeeds() {
        let source: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [20, 30, 40], length: 3 };
        let contract_address = AztecAddress::from_field(999);

        // Dest array of size 4, num_prepended_items + source.length = 1 + 3 = 4 exactly fills dest
        let dest: ClaimedLengthArray<Scoped<Field>, 4> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(111) },
                Scoped { inner: 20, contract_address },
                Scoped { inner: 30, contract_address },
                Scoped { inner: 40, contract_address },
            ],
            length: 4,
        };

        assert_array_appended_and_scoped(dest, source, 1, contract_address);
    }
}
