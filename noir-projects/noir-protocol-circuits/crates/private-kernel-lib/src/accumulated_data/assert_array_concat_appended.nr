use types::{
    address::aztec_address::AztecAddress, side_effect::Scoped, traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// Validates that source items are appended to a destination array which already contains
/// `prepend` data at indices [0..prepend.length), and a sequence of N per-call sources at
/// the running offset after `prepend.length`.
///
/// Semantics:
///   - dest.array[0..prepend.length]           == prepend.array[0..prepend.length]
///   - For s in 0..N:
///       let offset_s = prepend.length + sum_{j < s} sources[j].length
///       dest.array[offset_s + i] == sources[s].array[i]   for i in 0..sources[s].length
///   - dest.length                             == prepend.length + sum_{s < N} sources[s].length
///
/// The prepended check fires exactly once per accumulator array. Items beyond each source's
/// `length` are not asserted (matches `assert_array_appended` semantics - garbage is caught
/// later by the tail circuit's `assert_dense_trimmed`.
pub fn assert_array_concat_appended<T, let N: u32, let CALL_LEN: u32, let DEST_LEN: u32>(
    dest: ClaimedLengthArray<T, DEST_LEN>,
    prepend: ClaimedLengthArray<T, DEST_LEN>,
    sources: [ClaimedLengthArray<T, CALL_LEN>; N],
)
where
    T: Empty,
{
    std::static_assert(
        CALL_LEN <= DEST_LEN,
        "Source per-call larger than dest array",
    );

    prepend.for_each_i(|item, i| {
        assert_eq(dest.array[i], item, "prepend item does not match dest");
    });

    let mut running_offset = prepend.length;
    for s in 0..N {
        let source = sources[s];
        source.for_each_i(|source_item, i| {
            assert_eq(
                dest.array[running_offset + i],
                source_item,
                "source item does not append to dest",
            );
        });
        running_offset += source.length;
    }

    assert_eq(dest.length, running_offset, "Length mismatch");
}

/// Variant that additionally scopes each appended source item with a per-source
/// `contract_address` (one address per app). The prepended portion is asserted as-is
/// (already scoped from the previous kernel).
pub fn assert_array_concat_appended_and_scoped<T, let N: u32, let CALL_LEN: u32, let DEST_LEN: u32>(
    dest: ClaimedLengthArray<Scoped<T>, DEST_LEN>,
    prepend: ClaimedLengthArray<Scoped<T>, DEST_LEN>,
    sources: [ClaimedLengthArray<T, CALL_LEN>; N],
    contract_addresses: [AztecAddress; N],
)
where
    T: Empty,
{
    std::static_assert(
        CALL_LEN <= DEST_LEN,
        "Source per-call larger than dest array",
    );

    prepend.for_each_i(|item, i| {
        assert_eq(dest.array[i], item, "prepend item does not match dest");
    });

    let mut running_offset = prepend.length;
    for s in 0..N {
        let source = sources[s];
        let contract_address = contract_addresses[s];
        source.for_each_i(|source_item, i| {
            let dest_item = dest.array[running_offset + i];
            assert_eq(dest_item.inner, source_item, "source item does not append to dest");
            assert_eq(
                dest_item.contract_address,
                contract_address,
                "propagated contract address does not match",
            );
        });
        running_offset += source.length;
    }

    assert_eq(dest.length, running_offset, "Length mismatch");
}

mod tests {
    use super::{assert_array_concat_appended, assert_array_concat_appended_and_scoped};
    use types::{
        address::aztec_address::AztecAddress,
        side_effect::Scoped,
        traits::{Empty, FromField},
        utils::arrays::ClaimedLengthArray,
    };

    #[test]
    fn concat_appended_n1_succeeds() {
        let prepend: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0, 0], length: 2 };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 5 };

        assert_array_concat_appended(dest, prepend, [src0]);
    }

    #[test]
    fn concat_appended_n2_succeeds() {
        let prepend: ClaimedLengthArray<Field, 8> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0, 0, 0, 0], length: 2 };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let src1: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [60, 70, 0], length: 2 };
        let dest: ClaimedLengthArray<Field, 8> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 60, 70, 0], length: 7 };

        assert_array_concat_appended(dest, prepend, [src0, src1]);
    }

    #[test]
    fn concat_appended_n3_empty_prepend_succeeds() {
        let prepend: ClaimedLengthArray<Field, 10> = ClaimedLengthArray::empty();
        let src0: ClaimedLengthArray<Field, 3> = ClaimedLengthArray { array: [1, 2, 3], length: 3 };
        let src1: ClaimedLengthArray<Field, 3> = ClaimedLengthArray { array: [4, 5, 0], length: 2 };
        let src2: ClaimedLengthArray<Field, 3> = ClaimedLengthArray { array: [6, 0, 0], length: 1 };
        let dest: ClaimedLengthArray<Field, 10> =
            ClaimedLengthArray { array: [1, 2, 3, 4, 5, 6, 0, 0, 0, 0], length: 6 };

        assert_array_concat_appended(dest, prepend, [src0, src1, src2]);
    }

    #[test(should_fail_with = "source item does not append to dest")]
    fn concat_appended_n2_mismatch_in_second_source_fails() {
        let prepend: ClaimedLengthArray<Field, 8> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0, 0, 0, 0], length: 2 };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let src1: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [60, 70, 0], length: 2 };
        let dest: ClaimedLengthArray<Field, 8> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 99, 70, 0], length: 7 };

        assert_array_concat_appended(dest, prepend, [src0, src1]);
    }

    #[test(should_fail_with = "prepend item does not match dest")]
    fn concat_appended_prepend_mismatch_fails() {
        let prepend: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0, 0], length: 2 };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [11, 20, 30, 40, 50, 0], length: 5 };

        assert_array_concat_appended(dest, prepend, [src0]);
    }

    #[test(should_fail_with = "Length mismatch")]
    fn concat_appended_length_mismatch_fails() {
        let prepend: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 0, 0, 0, 0], length: 2 };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [30, 40, 50], length: 3 };
        let dest: ClaimedLengthArray<Field, 6> =
            ClaimedLengthArray { array: [10, 20, 30, 40, 50, 0], length: 4 };

        assert_array_concat_appended(dest, prepend, [src0]);
    }

    #[test]
    fn concat_appended_and_scoped_n2_succeeds() {
        let addr_a = AztecAddress::from_field(111);
        let addr_b = AztecAddress::from_field(222);
        let prepend: ClaimedLengthArray<Scoped<Field>, 8> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(999) },
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
                Scoped::empty(),
            ],
            length: 1,
        };
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [20, 30, 40], length: 3 };
        let src1: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [50, 60, 0], length: 2 };

        let dest: ClaimedLengthArray<Scoped<Field>, 8> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: AztecAddress::from_field(999) },
                Scoped { inner: 20, contract_address: addr_a },
                Scoped { inner: 30, contract_address: addr_a },
                Scoped { inner: 40, contract_address: addr_a },
                Scoped { inner: 50, contract_address: addr_b },
                Scoped { inner: 60, contract_address: addr_b },
                Scoped::empty(),
                Scoped::empty(),
            ],
            length: 6,
        };

        assert_array_concat_appended_and_scoped(dest, prepend, [src0, src1], [addr_a, addr_b]);
    }

    #[test(should_fail_with = "propagated contract address does not match")]
    fn concat_appended_and_scoped_wrong_address_fails() {
        let addr_a = AztecAddress::from_field(111);
        let addr_b = AztecAddress::from_field(222);
        let wrong = AztecAddress::from_field(888);
        let prepend: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray::empty();
        let src0: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [10, 20, 30], length: 3 };
        let src1: ClaimedLengthArray<Field, 3> =
            ClaimedLengthArray { array: [40, 50, 0], length: 2 };

        let dest: ClaimedLengthArray<Scoped<Field>, 6> = ClaimedLengthArray {
            array: [
                Scoped { inner: 10, contract_address: addr_a },
                Scoped { inner: 20, contract_address: addr_a },
                Scoped { inner: 30, contract_address: wrong },
                Scoped { inner: 40, contract_address: addr_b },
                Scoped { inner: 50, contract_address: addr_b },
                Scoped::empty(),
            ],
            length: 5,
        };

        assert_array_concat_appended_and_scoped(dest, prepend, [src0, src1], [addr_a, addr_b]);
    }
}
