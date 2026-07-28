use types::hash::accumulate_sha256;

/// Extends the Inbox rolling sha256 chain by the first `num_leaves` of `leaves`, returning the new rolling hash.
///
/// Each link is `h' = sha256ToField(h || leaf)` over the two 32-byte big-endian values, i.e. exactly one
/// `accumulate_sha256` step, matching the truncated-to-field sha256 the L1 `Inbox` accumulates and today's `inHash`
/// frontier tree uses at every node. The genesis rolling hash is zero.
///
/// The function takes a `start` and returns an end with no assumption about chunk position, so it chains sequentially
/// across chunked circuits: a segment's start hash is the previous segment's end. Lanes beyond `num_leaves` are never
/// absorbed — the Inbox chain only ever sees real messages.
pub fn accumulate_inbox_rolling_hash<let N: u32>(
    start: Field,
    leaves: [Field; N],
    num_leaves: u32,
) -> Field {
    assert(num_leaves <= N, "num_leaves is greater than the leaves array length");

    let mut acc = start;
    for i in 0..N {
        if i < num_leaves {
            acc = accumulate_sha256(acc, leaves[i]);
        }
    }
    acc
}

mod tests {
    use super::accumulate_inbox_rolling_hash;
    use types::{constants::NUM_MSGS_PER_BASE_PARITY, hash::accumulate_sha256};

    #[test]
    fn empty_bundle_passes_start_through() {
        assert_eq(accumulate_inbox_rolling_hash(0, [0; 8], 0), 0);
        // A non-zero start with no leaves is returned unchanged (segment threading base case).
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [11, 22, 33], 0), 0x2a);
    }

    #[test]
    fn single_leaf_matches_reference() {
        // Independent sha256 reference (see PR description): sha256ToField(0x00..00 || 0x00..0b), last byte dropped.
        let expected = 0x00815fb1e9d2076ae5761439b6144ad11da69eb6c41ab2aca39e770407ad8d12;
        assert_eq(accumulate_inbox_rolling_hash(0, [11, 0, 0, 0], 1), expected);
        assert_eq(accumulate_sha256(0, 11), expected);
    }

    #[test]
    fn three_leaves_matches_reference() {
        let expected = 0x0014cae968461979aab6d33266a2310ed234d3f6cf4472737c57551db07bd0da;
        assert_eq(accumulate_inbox_rolling_hash(0, [11, 22, 33, 0, 0], 3), expected);
    }

    #[test]
    fn base_parity_batch_matches_reference() {
        // NUM_MSGS_PER_BASE_PARITY leaves valued 1..=256 from a zero start.
        let mut leaves = [0; NUM_MSGS_PER_BASE_PARITY];
        for i in 0..NUM_MSGS_PER_BASE_PARITY {
            leaves[i] = (i + 1) as Field;
        }
        let expected = 0x00ea95b96f17b75be03525b35a2a1918b42f03ad8c00a437cf641751825f3992;
        assert_eq(accumulate_inbox_rolling_hash(0, leaves, NUM_MSGS_PER_BASE_PARITY), expected);
    }

    #[test]
    fn non_zero_start_matches_reference() {
        let expected = 0x0054d96b8a074a5030a5838972d0a3c04ba47cf5956348c853e02e9566233f65;
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [7, 8], 2), expected);
    }

    #[test]
    fn chain_is_continuous_across_segments() {
        // Chaining [7,8,9] from a start equals chaining [7] then [8,9] threaded by the intermediate hash.
        let start = 0x2a;
        let full = accumulate_inbox_rolling_hash(start, [7, 8, 9, 0, 0], 3);

        let mid = accumulate_inbox_rolling_hash(start, [7, 0], 1);
        let split = accumulate_inbox_rolling_hash(mid, [8, 9], 2);

        assert_eq(full, split);
    }

    #[test]
    fn padding_lanes_are_not_absorbed() {
        // A padded array with num_leaves set correctly matches the exact-length chain regardless of lane contents.
        let padded = accumulate_inbox_rolling_hash(0, [11, 22, 999, 888], 2);
        let exact = accumulate_inbox_rolling_hash(0, [11, 22], 2);
        assert_eq(padded, exact);
    }

    #[test(should_fail_with = "num_leaves is greater than the leaves array length")]
    fn num_leaves_past_array_fails() {
        let _ = accumulate_inbox_rolling_hash(0, [11, 22, 33], 4);
    }
}
