use types::{
    constants::{DOM_SEP__INBOX_ROLLING_HASH, DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START},
    hash::sha256_to_field,
};

/// Advances the Inbox rolling hash by one message leaf: `sha256ToField(separator || prev || leaf || bucket_timestamp)`
/// over the 4-byte big-endian separator, the two 32-byte big-endian fields and the 8-byte big-endian timestamp of the
/// bucket the leaf belongs to. The separator is `DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START` when the leaf opens its
/// bucket and `DOM_SEP__INBOX_ROLLING_HASH` otherwise.
pub fn update_inbox_rolling_hash(
    prev: Field,
    leaf: Field,
    opens_bucket: bool,
    bucket_timestamp: u64,
) -> Field {
    let separator = if opens_bucket {
        DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START
    } else {
        DOM_SEP__INBOX_ROLLING_HASH
    };
    let separator_bytes: [u8; 4] = (separator as Field).to_be_bytes();
    let prev_bytes: [u8; 32] = prev.to_be_bytes();
    let leaf_bytes: [u8; 32] = leaf.to_be_bytes();
    let timestamp_bytes: [u8; 8] = (bucket_timestamp as Field).to_be_bytes();
    sha256_to_field(
        separator_bytes.concat(prev_bytes).concat(leaf_bytes).concat(timestamp_bytes),
    )
}

/// Extends the Inbox rolling sha256 chain by the first `num_leaves` of `leaves`, returning the new rolling hash.
///
/// Each link is `h' = sha256ToField(sep || h || leaf || timestamp)` over the 4-byte big-endian separator, the two
/// 32-byte big-endian values and the 8-byte big-endian bucket timestamp, matching the truncated-to-field sha256 the
/// L1 `Inbox` accumulates. The separator is `DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START` when the leaf is the first
/// message of an L1 bucket and `DOM_SEP__INBOX_ROLLING_HASH` otherwise, and `bucket_timestamps[i]` is the L1
/// timestamp of the bucket leaf `i` belongs to, so the chain itself commits to where each bucket begins and to when
/// it was opened. Both separators distinguish a chain link from the untagged `out_hash` merkle node hash, which
/// absorbs the same two-field preimage shape. The genesis rolling hash is zero.
///
/// The function takes a `start` and returns an end with no assumption about chunk position, so it chains sequentially
/// across chunked circuits: a segment's start hash is the previous segment's end. Lanes beyond `num_leaves` are never
/// absorbed — the Inbox chain only ever sees real messages — and must carry a zero timestamp, so a padded input has
/// exactly one representation.
pub fn accumulate_inbox_rolling_hash<let N: u32>(
    start: Field,
    leaves: [Field; N],
    bucket_starts: [bool; N],
    bucket_timestamps: [u64; N],
    num_leaves: u32,
) -> Field {
    assert(num_leaves <= N, "num_leaves is greater than the leaves array length");

    let mut acc = start;
    for i in 0..N {
        if i < num_leaves {
            acc = update_inbox_rolling_hash(acc, leaves[i], bucket_starts[i], bucket_timestamps[i]);
        } else {
            assert(bucket_timestamps[i] == 0, "Found bucket timestamp after breakpoint");
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
    use super::{
        accumulate_inbox_rolling_hash, assert_valid_bucket_starts, update_inbox_rolling_hash,
    };
    use types::{constants::INBOX_PARITY_SIZE_MEDIUM, hash::accumulate_sha256};

    // The pinned hashes below are derived independently of every implementation of this chain by
    // `l1-contracts/scripts/inbox_rolling_hash_vectors.py` (plain `hashlib`); the same values are pinned in the L1
    // and TypeScript tests. Unless a vector is about timestamps, every bucket sits at this timestamp.
    global TS: u64 = 1000;

    // Flags for a chain whose first leaf opens a bucket and whose remaining leaves continue it: the shape of a
    // checkpoint consuming a single contiguous run out of one bucket.
    fn only_first_is_bucket_start<let N: u32>() -> [bool; N] {
        let mut bucket_starts = [false; N];
        bucket_starts[0] = true;
        bucket_starts
    }

    // Timestamps for a single-bucket chain of `num_leaves` messages: the bucket's timestamp on every absorbed lane,
    // zero on the padding.
    fn one_bucket_at<let N: u32>(timestamp: u64, num_leaves: u32) -> [u64; N] {
        let mut timestamps = [0; N];
        for i in 0..N {
            if i < num_leaves {
                timestamps[i] = timestamp;
            }
        }
        timestamps
    }

    #[test]
    fn empty_bundle_passes_start_through() {
        assert_eq(accumulate_inbox_rolling_hash(0, [0; 8], [false; 8], [0; 8], 0), 0);
        // A non-zero start with no leaves is returned unchanged (segment threading base case).
        assert_eq(accumulate_inbox_rolling_hash(0x2a, [11, 22, 33], [false; 3], [0; 3], 0), 0x2a);
    }

    #[test]
    fn single_leaf_matches_reference() {
        // sha256ToField(u32_be(DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START) || 0x00..00 || 0x00..0b || u64_be(1000)),
        // last byte dropped.
        let expected = 0x00a547352c19bddb35bcc0ce9a278ada5344922ba4e0c85463f2150ba5de7064;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0,
                [11, 0, 0, 0],
                only_first_is_bucket_start(),
                one_bucket_at(TS, 1),
                1,
            ),
            expected,
        );
        assert_eq(update_inbox_rolling_hash(0, 11, true, TS), expected);
    }

    #[test]
    fn three_leaves_matches_reference() {
        let expected = 0x00e767ae30130bf27ed2ece5f6685d6d93d835eca2750e5c3d51aa622ba65ae1;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0,
                [11, 22, 33, 0, 0],
                only_first_is_bucket_start(),
                one_bucket_at(TS, 3),
                3,
            ),
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
        let expected = 0x004360c26448f4003eb2d256b8561a671d419abc720f2e2366210afe6b50c5e0;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0,
                leaves,
                only_first_is_bucket_start(),
                one_bucket_at(TS, INBOX_PARITY_SIZE_MEDIUM),
                INBOX_PARITY_SIZE_MEDIUM,
            ),
            expected,
        );
    }

    #[test]
    fn non_zero_start_matches_reference() {
        let after_first = 0x0031fe0f1cb02f3ca761ac9340fdfbfde3ae8bd082e7115b9a3f467b38d23869;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0x2a,
                [7],
                only_first_is_bucket_start(),
                one_bucket_at(TS, 1),
                1,
            ),
            after_first,
        );

        let expected = 0x00b1e0bf8cec0ee768fb5fad71cbc3f84e5298fdc77b4680d821165433944437;
        assert_eq(
            accumulate_inbox_rolling_hash(
                0x2a,
                [7, 8],
                only_first_is_bucket_start(),
                one_bucket_at(TS, 2),
                2,
            ),
            expected,
        );
    }

    #[test]
    fn bucket_start_flag_changes_hash() {
        // Flipping a middle lane's bucket-start bit selects the other separator for that link, so the chain differs
        // even though the leaves and their timestamps are identical: regrouping the same messages into different
        // buckets is detectable. The two buckets here are rollover siblings, sharing one timestamp.
        let leaves = [11, 22, 33, 44];
        let one_bucket: [bool; 4] = only_first_is_bucket_start();
        let mut split_at_third = one_bucket;
        split_at_third[2] = true;
        let timestamps: [u64; 4] = one_bucket_at(TS, 4);

        let expected_one_bucket =
            0x003a0be72baad115a70b7b945d4b9df5a097f85f5bd545a3148828bd85a71f0b;
        let expected_two_buckets =
            0x006449486fd6561793f12c478f5f5401fa3b1d083206a5d6982635c1b9caee48;
        assert_eq(
            accumulate_inbox_rolling_hash(0, leaves, one_bucket, timestamps, 4),
            expected_one_bucket,
        );
        assert_eq(
            accumulate_inbox_rolling_hash(0, leaves, split_at_third, timestamps, 4),
            expected_two_buckets,
        );
        assert(expected_one_bucket != expected_two_buckets);
    }

    #[test]
    fn bucket_timestamp_changes_hash() {
        // The same leaves in the same buckets, with the second bucket opened one second later: the chain differs from
        // its first re-timed link on, which is what lets a node detect an L1 reorg that only re-times the blocks.
        let leaves = [11, 22, 33, 44];
        let mut split_at_third: [bool; 4] = only_first_is_bucket_start();
        split_at_third[2] = true;

        let same_time: [u64; 4] = one_bucket_at(TS, 4);
        let retimed: [u64; 4] = [TS, TS, TS + 1, TS + 1];

        let expected_same_time = 0x006449486fd6561793f12c478f5f5401fa3b1d083206a5d6982635c1b9caee48;
        let expected_retimed = 0x00cb36ebc4a3b5cf0adfda4a42c0011deae1d407fa3191acece69dacdd16594b;
        assert_eq(
            accumulate_inbox_rolling_hash(0, leaves, split_at_third, same_time, 4),
            expected_same_time,
        );
        assert_eq(
            accumulate_inbox_rolling_hash(0, leaves, split_at_third, retimed, 4),
            expected_retimed,
        );
        assert(expected_same_time != expected_retimed);
    }

    #[test]
    fn timestamp_extremes_match_reference() {
        // The whole `u64` range is absorbed as eight big-endian bytes.
        assert_eq(
            accumulate_inbox_rolling_hash(0, [11], only_first_is_bucket_start(), [0], 1),
            0x00277b3c9e3871988dcb2ad539e4a567db746f01d3e06573a13eafab5dc92eaa,
        );
        assert_eq(
            accumulate_inbox_rolling_hash(
                0,
                [11],
                only_first_is_bucket_start(),
                [0xffffffffffffffff],
                1,
            ),
            0x001e0d6e38689a3dbd197f379b6cb95abbe87158852e98e3489b0cb040452dbd,
        );
    }

    #[test]
    fn separator_distinguishes_link_from_untagged_hash() {
        // Neither separator may let a link coincide with an untagged two-field sha256 over the same values, such as
        // an `out_hash` merkle node.
        assert(
            accumulate_inbox_rolling_hash(
                0,
                [11],
                only_first_is_bucket_start(),
                one_bucket_at(TS, 1),
                1,
            )
                != accumulate_sha256(0, 11),
        );
        assert(
            accumulate_inbox_rolling_hash(0, [11], [false], one_bucket_at(TS, 1), 1)
                != accumulate_sha256(0, 11),
        );
    }

    #[test]
    fn chain_is_continuous_across_segments() {
        // Chaining [7,8,9] from a start equals chaining [7] then [8,9] threaded by the intermediate hash, with the
        // bucket-start flags and timestamps following the leaves across the split.
        let start = 0x2a;
        let full = accumulate_inbox_rolling_hash(
            start,
            [7, 8, 9, 0, 0],
            only_first_is_bucket_start(),
            one_bucket_at(TS, 3),
            3,
        );

        let mid = accumulate_inbox_rolling_hash(
            start,
            [7, 0],
            only_first_is_bucket_start(),
            one_bucket_at(TS, 1),
            1,
        );
        let split = accumulate_inbox_rolling_hash(mid, [8, 9], [false; 2], [TS, TS], 2);

        assert_eq(full, split);
    }

    #[test]
    fn padding_lanes_are_not_absorbed() {
        // A padded array with num_leaves set correctly matches the exact-length chain regardless of lane contents,
        // flags included.
        let mut padded_starts: [bool; 4] = only_first_is_bucket_start();
        padded_starts[3] = true;
        let padded = accumulate_inbox_rolling_hash(
            0,
            [11, 22, 999, 888],
            padded_starts,
            one_bucket_at(TS, 2),
            2,
        );
        let exact = accumulate_inbox_rolling_hash(
            0,
            [11, 22],
            only_first_is_bucket_start(),
            one_bucket_at(TS, 2),
            2,
        );
        assert_eq(padded, exact);
    }

    #[test(should_fail_with = "Found bucket timestamp after breakpoint")]
    fn bucket_timestamp_in_padding_lane_fails() {
        let _ = accumulate_inbox_rolling_hash(
            0,
            [11, 22, 0, 0],
            only_first_is_bucket_start(),
            [TS, TS, TS, 0],
            2,
        );
    }

    #[test(should_fail_with = "num_leaves is greater than the leaves array length")]
    fn num_leaves_past_array_fails() {
        let _ = accumulate_inbox_rolling_hash(
            0,
            [11, 22, 33],
            only_first_is_bucket_start(),
            one_bucket_at(TS, 3),
            4,
        );
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
