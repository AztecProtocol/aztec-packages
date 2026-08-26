use types::{
    constants::{DOM_SEP__INBOX_ROLLING_HASH, DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START},
    hash::accumulate_sha256_with_separator,
};

/// Extends the Inbox rolling sha256 chain by the first `num_leaves` of `leaves`, returning the new rolling hash.
///
/// Each link is `h' = sha256ToField(sep || h || leaf)` over the 4-byte big-endian separator followed by the two
/// 32-byte big-endian values, matching the truncated-to-field sha256 the L1 `Inbox` accumulates. The separator is
/// `DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START` when the leaf is the first message of an L1 bucket and
/// `DOM_SEP__INBOX_ROLLING_HASH` otherwise, so the chain itself commits to where each bucket begins. Both separators
/// distinguish a chain link from the untagged `out_hash` merkle node hash, which absorbs the same two-field preimage
/// shape. The genesis rolling hash is zero.
///
/// The function takes a `start` and returns an end with no assumption about chunk position, so it chains sequentially
/// across chunked circuits: a segment's start hash is the previous segment's end. Lanes beyond `num_leaves` are never
/// absorbed — the Inbox chain only ever sees real messages.
pub fn accumulate_inbox_rolling_hash<let N: u32>(
    start: Field,
    leaves: [Field; N],
    bucket_starts: [bool; N],
    num_leaves: u32,
) -> Field {
    assert(num_leaves <= N, "num_leaves is greater than the leaves array length");

    let mut acc = start;
    for i in 0..N {
        if i < num_leaves {
            let separator = if bucket_starts[i] {
                DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START
            } else {
                DOM_SEP__INBOX_ROLLING_HASH
            };
            acc = accumulate_sha256_with_separator(separator, acc, leaves[i]);
        }
    }
    acc
}

/// Asserts that the bucket-start flags of a consumed run of `num` messages are well-formed.
///
/// The run must open a bucket: a bucket is only ever consumed from its first unconsumed message onwards, so whoever
/// starts consuming (a checkpoint, or a block within it) always starts at a bucket boundary. Padding lanes past the
/// run must not claim a bucket start, mirroring the zero-padding guard on the leaves themselves.
pub fn assert_valid_bucket_starts<let N: u32>(bucket_starts: [bool; N], num: u32) {
    if num > 0 {
        assert(bucket_starts[0], "First consumed message must open a bucket");
    }
    let mut is_padding = false;
    for i in 0..N {
        is_padding |= i == num;
        if is_padding {
            assert(!bucket_starts[i], "Found bucket start after breakpoint");
        }
    }
}

mod tests {
    use super::{accumulate_inbox_rolling_hash, assert_valid_bucket_starts};
    use types::{
        constants::{DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START, INBOX_PARITY_SIZE_MEDIUM},
        hash::{accumulate_sha256, accumulate_sha256_with_separator},
    };

    // The pinned hashes below are derived independently of every implementation of this chain by
    // `l1-contracts/scripts/inbox_rolling_hash_vectors.py` (plain `hashlib`); the same values are pinned in the L1
    // and TypeScript tests.

    // Flags for a chain whose first leaf opens a bucket and whose remaining leaves continue it: the shape of a
    // checkpoint consuming a single contiguous run out of one bucket.
    fn only_first_is_bucket_start<let N: u32>() -> [bool; N] {
        let mut bucket_starts = [false; N];
        bucket_starts[0] = true;
        bucket_starts
    }

    #[test]
    fn empty_bundle_passes_start_through() {
        assert_eq(accumulate_inbox_rolling_hash(0, [0; 8], [false; 8], 0), 0);
        // A non-zero start with no leaves is returned unchanged (segment threading base case).
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [11, 22, 33], [false; 3], 0), 0x2a);
    }

    #[test]
    fn single_leaf_matches_reference() {
        // sha256ToField(u32_be(DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START) || 0x00..00 || 0x00..0b), last byte dropped.
        let expected = 0x00551b59fed79dcce036e55050cf38ef367abfec03557e234866ac023879b245;
        assert_eq(
            accumulate_inbox_rolling_hash(0, [11, 0, 0, 0], only_first_is_bucket_start(), 1),
            expected,
        );
        assert_eq(
            accumulate_sha256_with_separator(DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START, 0, 11),
            expected,
        );
    }

    #[test]
    fn three_leaves_matches_reference() {
        let expected = 0x00e6cba8a055d279f8568edc4d0969a107fcda0c48347afdfd3dfeb053aa22c7;
        assert_eq(
            accumulate_inbox_rolling_hash(0, [11, 22, 33, 0, 0], only_first_is_bucket_start(), 3),
            expected,
        );
    }

    #[test]
    fn batch_matches_reference() {
        // 256 leaves valued 1..=256 from a zero start, all in a single bucket.
        let mut leaves = [0; INBOX_PARITY_SIZE_MEDIUM];
        for i in 0..INBOX_PARITY_SIZE_MEDIUM {
            leaves[i] = (i + 1) as Field;
        }
        let expected = 0x009ff152cad9525e1c092ae6d4fb390149de5599eac09b76b0ebd1c6e26bb504;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0,
                leaves,
                only_first_is_bucket_start(),
                INBOX_PARITY_SIZE_MEDIUM,
            ),
            expected,
        );
    }

    #[test]
    fn non_zero_start_matches_reference() {
        let after_first = 0x00f13cb848052a7ab6f1de788a5979f5a5caa8c11cf176715d63481618e3b575;
        assert_eq(
            accumulate_inbox_rolling_hash(0x2a, [7], only_first_is_bucket_start(), 1),
            after_first,
        );

        let expected = 0x00d84d0b60599b1c7380a723d84310d40efaa4f5673dd62e0af41b03bc9a07a6;
        assert_eq(
            accumulate_inbox_rolling_hash(0x2a, [7, 8], only_first_is_bucket_start(), 2),
            expected,
        );
    }

    #[test]
    fn bucket_start_flag_changes_hash() {
        // Flipping a middle lane's bucket-start bit selects the other separator for that link, so the chain differs
        // even though the leaves are identical: regrouping the same messages into different buckets is detectable.
        let leaves = [11, 22, 33, 44];
        let one_bucket: [bool; 4] = only_first_is_bucket_start();
        let mut split_at_third = one_bucket;
        split_at_third[2] = true;

        let expected_one_bucket =
            0x00e37b7cc5526ab379c54209bc1c6a4ba2c457d024330281b97a533561701551;
        let expected_two_buckets =
            0x00fa0346e7c4ee1bdf29a48af28182fdc236e2936e4d0c2e951dbd4b9b6464fc;
        assert_eq(accumulate_inbox_rolling_hash(0, leaves, one_bucket, 4), expected_one_bucket);
        assert_eq(
            accumulate_inbox_rolling_hash(0, leaves, split_at_third, 4),
            expected_two_buckets,
        );
        assert(expected_one_bucket != expected_two_buckets);
    }

    #[test]
    fn separator_distinguishes_link_from_untagged_hash() {
        // Neither separator may let a link coincide with an untagged two-field sha256 over the same values, such as
        // an `out_hash` merkle node.
        assert(
            accumulate_inbox_rolling_hash(0, [11], only_first_is_bucket_start(), 1)
                != accumulate_sha256(0, 11),
        );
        assert(accumulate_inbox_rolling_hash(0, [11], [false], 1) != accumulate_sha256(0, 11));
    }

    #[test]
    fn chain_is_continuous_across_segments() {
        // Chaining [7,8,9] from a start equals chaining [7] then [8,9] threaded by the intermediate hash, with the
        // bucket-start flags following the leaves across the split.
        let start = 0x2a;
        let full =
            accumulate_inbox_rolling_hash(start, [7, 8, 9, 0, 0], only_first_is_bucket_start(), 3);

        let mid = accumulate_inbox_rolling_hash(start, [7, 0], only_first_is_bucket_start(), 1);
        let split = accumulate_inbox_rolling_hash(mid, [8, 9], [false; 2], 2);

        assert_eq(full, split);
    }

    #[test]
    fn padding_lanes_are_not_absorbed() {
        // A padded array with num_leaves set correctly matches the exact-length chain regardless of lane contents,
        // flags included.
        let mut padded_starts: [bool; 4] = only_first_is_bucket_start();
        padded_starts[3] = true;
        let padded = accumulate_inbox_rolling_hash(0, [11, 22, 999, 888], padded_starts, 2);
        let exact = accumulate_inbox_rolling_hash(0, [11, 22], only_first_is_bucket_start(), 2);
        assert_eq(padded, exact);
    }

    #[test(should_fail_with = "num_leaves is greater than the leaves array length")]
    fn num_leaves_past_array_fails() {
        let _ = accumulate_inbox_rolling_hash(0, [11, 22, 33], only_first_is_bucket_start(), 4);
    }

    #[test]
    fn valid_bucket_starts_accepted() {
        assert_valid_bucket_starts([true, false, false, false], 3);
        assert_valid_bucket_starts([true, true, true], 3);
        assert_valid_bucket_starts([false, false], 0);
        assert_valid_bucket_starts([true, false], 2);
    }

    #[test(should_fail_with = "First consumed message must open a bucket")]
    fn bucket_starts_not_opening_a_bucket_fails() {
        assert_valid_bucket_starts([false, true, false], 2);
    }

    #[test(should_fail_with = "Found bucket start after breakpoint")]
    fn bucket_start_in_padding_lane_fails() {
        assert_valid_bucket_starts([true, false, true], 2);
    }
}
