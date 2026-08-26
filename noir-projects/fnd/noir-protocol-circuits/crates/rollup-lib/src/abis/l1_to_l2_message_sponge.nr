use std::meta::derive;
use types::{
    hash::poseidon2_absorb_in_chunks_existing_sponge,
    poseidon2::Poseidon2Sponge,
    traits::{Deserialize, Empty, Serialize},
};

/// Message leaves are `sha256ToField` outputs — a sha256 digest with its last byte dropped — so a real leaf always fits
/// in 248 bits, leaving the bits above free to carry the bucket-start flag.
global L1_TO_L2_MESSAGE_LEAF_BITS: u32 = 248;

/// `2^L1_TO_L2_MESSAGE_LEAF_BITS`: the weight the bucket-start flag is packed at, just above the leaf.
global BUCKET_START_SHIFT: Field =
    452312848583266388373324160190187140051835877600158453279131187530910662656;

/// An absorb-only Poseidon2 sponge over L1-to-L2 message leaves and their bucket-start flags.
///
/// It threads across the blocks of a checkpoint the way `SpongeBlob` threads tx effects: each block absorbs its message
/// bundle into the sponge it inherited from the previous block, and the checkpoint root recomputes the sponge over the
/// flat concatenation of every block's messages and asserts the final states are equal. There are no block separators
/// or markers in the absorbed stream, so the recomputation is identical regardless of how messages were split across
/// blocks — but each leaf carries its bucket-start flag, so a split that cuts a bucket in half makes a block claim a
/// boundary the checkpoint's own flags do not have, and the two states diverge. The sponge is never squeezed on the
/// block path — equality of the accumulated state is the only check.
#[derive(Deserialize, Eq, Serialize)]
pub struct L1ToL2MessageSponge {
    pub sponge: Poseidon2Sponge,
    /// The number of message leaves absorbed so far, which is also the number of absorbed fields: a leaf and its
    /// bucket-start flag share one field.
    pub num_absorbed: u32,
}

impl L1ToL2MessageSponge {
    pub fn new() -> Self {
        Self { sponge: Poseidon2Sponge::new(0), num_absorbed: 0 }
    }

    /// Absorb the first `num` leaves of `leaves` in order, one field per leaf: the leaf with its bucket-start flag
    /// packed above it, `leaf + (flag as Field) * 2^248`. Lanes beyond `num` are ignored.
    ///
    /// Every absorbed leaf is range-checked to `L1_TO_L2_MESSAGE_LEAF_BITS` bits, and that check is what makes the
    /// packing injective. Without it a block could absorb `leaf + 2^248` with its own flag cleared and land on the
    /// field the checkpoint reaches for `leaf` with the flag set — letting the block deny a bucket boundary the
    /// checkpoint asserts, i.e. start consuming mid-bucket, while the two sponge states still agree. Real leaves are
    /// truncated sha256 digests and always fit, so the check only ever rejects a forged witness.
    pub fn absorb<let N: u32>(&mut self, leaves: [Field; N], bucket_starts: [bool; N], num: u32) {
        let mut packed = [0; N];
        let mut is_padding = false;
        for i in 0..N {
            is_padding |= i == num;
            // Padding lanes are never absorbed, so they are zeroed out rather than held to the leaf range.
            let leaf = if is_padding { 0 } else { leaves[i] };
            leaf.assert_max_bit_size::<L1_TO_L2_MESSAGE_LEAF_BITS>();
            packed[i] = leaf + (bucket_starts[i] as Field) * BUCKET_START_SHIFT;
        }
        self.sponge = poseidon2_absorb_in_chunks_existing_sponge(self.sponge, packed, num);
        self.num_absorbed += num;
    }

    /// Finalize the sponge and output the (non-standard) Poseidon2 hash of everything absorbed so far.
    pub fn squeeze(&mut self) -> Field {
        self.sponge.squeeze()
    }
}

impl Empty for L1ToL2MessageSponge {
    fn empty() -> Self {
        Self { sponge: Poseidon2Sponge::new(0), num_absorbed: 0 }
    }
}

mod tests {
    use super::{BUCKET_START_SHIFT, L1ToL2MessageSponge};
    use types::{poseidon2::Poseidon2Sponge, traits::Empty};

    // Flags for a run that opens one bucket and continues it, the common single-bucket shape.
    fn opens_one_bucket<let N: u32>() -> [bool; N] {
        let mut bucket_starts = [false; N];
        bucket_starts[0] = true;
        bucket_starts
    }

    #[test]
    fn new_equals_empty() {
        assert_eq(L1ToL2MessageSponge::new(), L1ToL2MessageSponge::empty());
        assert_eq(L1ToL2MessageSponge::new().num_absorbed, 0);
    }

    #[test]
    fn absorb_tracks_message_count() {
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22, 33, 0, 0], opens_one_bucket(), 3);
        assert_eq(sponge.num_absorbed, 3);
        sponge.absorb([44, 55], opens_one_bucket(), 2);
        assert_eq(sponge.num_absorbed, 5);
    }

    #[test]
    fn absorb_ignores_lanes_past_count() {
        // Lanes beyond `num` must not affect the accumulated state, flags included.
        let mut padded_starts: [bool; 5] = opens_one_bucket();
        padded_starts[4] = true;
        let mut with_padding = L1ToL2MessageSponge::new();
        with_padding.absorb([11, 22, 33, 999, 888], padded_starts, 3);

        let mut exact = L1ToL2MessageSponge::new();
        exact.absorb([11, 22, 33], opens_one_bucket(), 3);

        assert_eq(with_padding, exact);
    }

    #[test]
    fn absorb_equality_across_split_boundaries() {
        // Splitting at a bucket boundary reaches the same state: [11,22,33 | 44,55] with a bucket opening at 11 and
        // another at 44 absorbs the same packed stream as the whole run in one call.
        let mut single = L1ToL2MessageSponge::new();
        single.absorb([11, 22, 33, 44, 55], [true, false, false, true, false], 5);

        let mut threaded = L1ToL2MessageSponge::new();
        threaded.absorb([11, 22, 33, 44, 55], [true, false, false, true, false], 3);
        threaded.absorb([44, 55, 0, 0, 0], [true, false, false, false, false], 2);

        assert_eq(threaded, single);
        assert_eq(threaded.num_absorbed, 5);

        let mut single_squeeze = single;
        let mut threaded_squeeze = threaded;
        assert_eq(threaded_squeeze.squeeze(), single_squeeze.squeeze());
    }

    #[test]
    fn absorb_split_mid_bucket_diverges() {
        // The same leaves split so that the second chunk starts mid-bucket: the second chunk can only claim a
        // boundary at 44 that the checkpoint's own flags do not have, so the states must differ.
        let mut single = L1ToL2MessageSponge::new();
        single.absorb([11, 22, 33, 44, 55], opens_one_bucket(), 5);

        let mut threaded = L1ToL2MessageSponge::new();
        threaded.absorb([11, 22, 33, 44, 55], opens_one_bucket(), 3);
        threaded.absorb([44, 55, 0, 0, 0], opens_one_bucket(), 2);

        assert(threaded != single);
    }

    #[test]
    fn flipping_a_flag_changes_the_state() {
        let mut one_bucket = L1ToL2MessageSponge::new();
        one_bucket.absorb([11, 22, 33], [true, false, false], 3);

        let mut two_buckets = L1ToL2MessageSponge::new();
        two_buckets.absorb([11, 22, 33], [true, true, false], 3);

        assert(one_bucket != two_buckets);
        // The flags are what differ, not the leaf count.
        assert_eq(one_bucket.num_absorbed, two_buckets.num_absorbed);
    }

    #[test]
    fn empty_bundle_is_noop() {
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([0; 5], [false; 5], 0);
        assert_eq(sponge, L1ToL2MessageSponge::empty());
    }

    #[test]
    fn matches_raw_poseidon2_sponge_of_packed_stream() {
        // The accumulated state must be a plain absorb-only Poseidon2 sponge with iv = 0 over one packed field per
        // leaf, the flag sitting above the leaf's 248 bits.
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22, 33], [true, false, true], 3);

        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(11 + BUCKET_START_SHIFT);
        expected.absorb(22);
        expected.absorb(33 + BUCKET_START_SHIFT);

        assert_eq(sponge.sponge, expected);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn oversized_leaf_fails() {
        // A leaf that does not fit under the flag's weight could impersonate a flagged smaller leaf.
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22 + BUCKET_START_SHIFT, 33], [true, false, false], 3);
    }

    #[test]
    fn oversized_padding_lane_is_ignored() {
        // The range check applies to the absorbed lanes only; padding lanes are zeroed before it.
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22, 33 + BUCKET_START_SHIFT], [true, false, false], 2);

        let mut exact = L1ToL2MessageSponge::new();
        exact.absorb([11, 22], [true, false], 2);

        assert_eq(sponge, exact);
    }
}
