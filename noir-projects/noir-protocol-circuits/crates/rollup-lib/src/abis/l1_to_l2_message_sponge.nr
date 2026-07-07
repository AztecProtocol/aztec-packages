use std::meta::derive;
use types::{
    hash::poseidon2_absorb_in_chunks_existing_sponge,
    poseidon2::Poseidon2Sponge,
    traits::{Deserialize, Empty, Serialize},
};

/// An absorb-only Poseidon2 sponge over L1-to-L2 message leaves.
///
/// It threads across the blocks of a checkpoint the way `SpongeBlob` threads tx effects: each block absorbs its message
/// bundle into the sponge it inherited from the previous block, and the checkpoint root recomputes the sponge over the
/// flat concatenation of every block's messages and asserts the final states are equal. There are no block separators
/// or markers in the absorbed stream, so the recomputation is identical regardless of how messages were split across
/// blocks. The sponge is never squeezed on the block path — equality of the accumulated state is the only check.
#[derive(Deserialize, Eq, Serialize)]
pub struct L1ToL2MessageSponge {
    pub sponge: Poseidon2Sponge,
    /// The number of message leaves absorbed so far.
    pub num_absorbed: u32,
}

impl L1ToL2MessageSponge {
    pub fn new() -> Self {
        Self { sponge: Poseidon2Sponge::new(0), num_absorbed: 0 }
    }

    /// Absorb the first `num` leaves of `leaves` in order. Lanes beyond `num` are ignored.
    pub fn absorb<let N: u32>(&mut self, leaves: [Field; N], num: u32) {
        self.sponge = poseidon2_absorb_in_chunks_existing_sponge(self.sponge, leaves, num);
        self.num_absorbed += num;
    }

    /// Finalize the sponge and output the (non-standard) Poseidon2 hash of all absorbed leaves.
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
    use super::L1ToL2MessageSponge;
    use types::{poseidon2::Poseidon2Sponge, traits::Empty};

    #[test]
    fn new_equals_empty() {
        assert_eq(L1ToL2MessageSponge::new(), L1ToL2MessageSponge::empty());
        assert_eq(L1ToL2MessageSponge::new().num_absorbed, 0);
    }

    #[test]
    fn absorb_tracks_count() {
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22, 33, 0, 0], 3);
        assert_eq(sponge.num_absorbed, 3);
        sponge.absorb([44, 55], 2);
        assert_eq(sponge.num_absorbed, 5);
    }

    #[test]
    fn absorb_ignores_lanes_past_count() {
        // Lanes beyond `num` must not affect the accumulated state.
        let mut with_padding = L1ToL2MessageSponge::new();
        with_padding.absorb([11, 22, 33, 999, 888], 3);

        let mut exact = L1ToL2MessageSponge::new();
        exact.absorb([11, 22, 33], 3);

        assert_eq(with_padding, exact);
    }

    #[test]
    fn absorb_equality_across_split_boundaries() {
        // Absorbing [11,22,33,44,55] in one call equals absorbing [11,22,33] then [44,55] across two threaded sponges.
        let mut single = L1ToL2MessageSponge::new();
        single.absorb([11, 22, 33, 44, 55], 5);

        let mut threaded = L1ToL2MessageSponge::new();
        threaded.absorb([11, 22, 33, 44, 55], 3);
        threaded.absorb([44, 55, 0, 0, 0], 2);

        assert_eq(threaded, single);
        assert_eq(threaded.num_absorbed, 5);

        let mut single_squeeze = single;
        let mut threaded_squeeze = threaded;
        assert_eq(threaded_squeeze.squeeze(), single_squeeze.squeeze());
    }

    #[test]
    fn empty_bundle_is_noop() {
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([0; 5], 0);
        assert_eq(sponge, L1ToL2MessageSponge::empty());
    }

    #[test]
    fn matches_raw_poseidon2_sponge() {
        // The accumulated state must be a plain absorb-only Poseidon2 sponge with iv = 0.
        let mut sponge = L1ToL2MessageSponge::new();
        sponge.absorb([11, 22, 33, 44, 55], 5);

        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(11);
        expected.absorb(22);
        expected.absorb(33);
        expected.absorb(44);
        expected.absorb(55);

        assert_eq(sponge.sponge, expected);
    }
}
