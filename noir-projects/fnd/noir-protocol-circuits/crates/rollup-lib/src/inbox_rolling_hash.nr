use types::{constants::DOM_SEP__INBOX_ROLLING_HASH, hash::accumulate_sha256_with_separator};

/// Extends the Inbox rolling sha256 chain by the first `num_leaves` of `leaves`, returning the new rolling hash.
///
/// Each link is `h' = sha256ToField(DOM_SEP__INBOX_ROLLING_HASH || h || leaf)` over the 4-byte big-endian separator
/// followed by the two 32-byte big-endian values, matching the truncated-to-field sha256 the L1 `Inbox` accumulates.
/// The separator distinguishes a chain link from the untagged `out_hash` merkle node hash, which absorbs the same
/// two-field preimage shape. The genesis rolling hash is zero.
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
            acc = accumulate_sha256_with_separator(DOM_SEP__INBOX_ROLLING_HASH, acc, leaves[i]);
        }
    }
    acc
}

mod tests {
    use super::accumulate_inbox_rolling_hash;
    use types::{
        constants::{DOM_SEP__INBOX_ROLLING_HASH, INBOX_PARITY_SIZE_MEDIUM},
        hash::{accumulate_sha256, accumulate_sha256_with_separator},
    };

    #[test]
    fn empty_bundle_passes_start_through() {
        assert_eq(accumulate_inbox_rolling_hash(0, [0; 8], 0), 0);
        // A non-zero start with no leaves is returned unchanged (segment threading base case).
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [11, 22, 33], 0), 0x2a);
    }

    #[test]
    fn single_leaf_matches_reference() {
        // Independent sha256 reference (see PR description): sha256ToField(0xdec16509 || 0x00..00 || 0x00..0b), last
        // byte dropped.
        let expected = 0x00066dfa22681f66d50aae7d84f190e3555d2d82e4a5e33c2291c3060d441f04;
        assert_eq(accumulate_inbox_rolling_hash(0, [11, 0, 0, 0], 1), expected);
        assert_eq(accumulate_sha256_with_separator(DOM_SEP__INBOX_ROLLING_HASH, 0, 11), expected);
    }

    #[test]
    fn three_leaves_matches_reference() {
        let expected = 0x0077423b713a725ce4bf0b792847c68da87c316d52921de25652756bfe4c3e81;
        assert_eq(accumulate_inbox_rolling_hash(0, [11, 22, 33, 0, 0], 3), expected);
    }

    #[test]
    fn batch_matches_reference() {
        // 256 leaves valued 1..=256 from a zero start.
        let mut leaves = [0; INBOX_PARITY_SIZE_MEDIUM];
        for i in 0..INBOX_PARITY_SIZE_MEDIUM {
            leaves[i] = (i + 1) as Field;
        }
        let expected = 0x0030493fcb5915459bba42f03f283b58dfaa082dac02fbb3a494d5db8063238b;
        assert_eq(accumulate_inbox_rolling_hash(0, leaves, INBOX_PARITY_SIZE_MEDIUM), expected);
    }

    #[test]
    fn non_zero_start_matches_reference() {
        let expected = 0x00a64d14c4b0234f5d835dc202bf8f9a857bc0734baf281dccd4b4978a48b2f9;
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [7, 8], 2), expected);
    }

    #[test]
    fn separator_distinguishes_link_from_untagged_hash() {
        // A link must not coincide with an untagged two-field sha256 over the same values, such as an `out_hash`
        // merkle node.
        assert(accumulate_inbox_rolling_hash(0, [11], 1) != accumulate_sha256(0, 11));
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
