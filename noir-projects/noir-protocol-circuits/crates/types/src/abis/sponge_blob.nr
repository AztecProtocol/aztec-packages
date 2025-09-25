use crate::{
    constants::{SPONGE_BLOB_LENGTH, TWO_POW_64},
    hash::poseidon2_absorb_chunks_existing_sponge,
    poseidon2::Poseidon2Sponge,
    traits::{Deserialize, Empty, Serialize},
};

/// A Poseidon2 sponge used to accumulate data that will be added to blob(s).
/// (More accurately called BlobSponge, but that's not as fun).
///
/// The journey of a SpongeBlob:
///
/// Tx base: each tx absorbs its effects into the given "start" SpongeBlob and outputs it as the "end" SpongeBlob.
/// Tx merge or block root checks that the start SpongeBlob of a tx matches the end SpongeBlob of the previous tx.
///
/// Block root: the end SpongeBlob of the last tx absorbs a special block end marker indicating the number of txs in
/// the block. The block header commits to the value squeezed from this SpongeBlob. This updated SpongeBlob is then
/// output as the end SpongeBlob of the block root. In block merge or checkpoint root, the start SpongeBlob is checked
/// against the end SpongeBlob of the previous block.
///
/// Checkpoint root: receives all fields as private inputs and checks that hashing them matches the final hash squeezed
/// from the end SpongeBlob of the last block, after confirming that and the number of fields absorbed matches the value
/// the SpongeBlob was initialized with. It also checks that the start SpongeBlob of the first tx in the block does not
/// have any fields absorbed.
///
/// The final hash is used as part of the blob challenge, proving that all fields of the blob(s) are included.
#[derive(Deserialize, Eq, Serialize)]
pub struct SpongeBlob {
    pub sponge: Poseidon2Sponge,
    pub fields: u32, // The number of fields absorbed so far. TODO: rename to `num_absorbed_fields`.
    pub expected_fields: u32, // The hinted number of fields this sponge will absorb. TODO: rename to `num_expected_fields`.
}

impl SpongeBlob {
    pub fn new(expected_fields: u32) -> Self {
        // New sponge is initialized with `expected_fields` * 2^64.
        // (see noir/noir-repo/noir_stdlib/src/hash/poseidon2.nr -> hash_internal)
        Self {
            sponge: Poseidon2Sponge::new((expected_fields as Field) * TWO_POW_64),
            fields: 0,
            expected_fields,
        }
    }

    /// Add `in_len` fields to the sponge.
    pub fn absorb<let N: u32>(&mut self, input: [Field; N], in_len: u32) {
        // We skip the 0 check below, as most use cases (e.g. base rollup) constrain that the input array
        // is constructed from i=0->in_len from an empty array, so no need to check.
        self.sponge = poseidon2_absorb_chunks_existing_sponge(self.sponge, input, in_len, true);
        self.fields += in_len;
    }

    /// Finalize the sponge and output poseidon2 hash of all fields absorbed.
    pub fn squeeze(&mut self) -> Field {
        // If the blob sponge is not 'full', we append 1 to match Poseidon2::hash_internal()
        if self.fields != self.expected_fields {
            self.sponge.absorb(1);
        }
        self.sponge.squeeze()
    }
}

impl Empty for SpongeBlob {
    fn empty() -> Self {
        Self { sponge: Poseidon2Sponge::new(0), fields: 0, expected_fields: 0 }
    }
}

#[test]
fn test_sponge_blob_serialization() {
    let item = SpongeBlob { sponge: Poseidon2Sponge::new(123), fields: 456, expected_fields: 789 };

    // We use the SPONGE_BLOB_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; SPONGE_BLOB_LENGTH] = item.serialize();
    let deserialized = SpongeBlob::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
unconstrained fn absorb() {
    // This tests that absorbing two arrays separately then squeezing matches an ordinary hash
    let mut spongeblob = SpongeBlob::new(7);
    let input_3 = [1, 2, 3];
    spongeblob.absorb(input_3, input_3.len());
    // Assert that we have correctly absorbed the first 3 inputs
    assert(spongeblob.sponge.cache.eq(input_3));
    assert(spongeblob.fields == input_3.len());
    // Absorb the next 4 in a new call...
    let input_4 = [4, 5, 6, 7];
    spongeblob.absorb(input_4, input_4.len());
    // ...and create a normal poseidon2 hash of the same input
    let input: [Field; 7] = input_3.concat(input_4);
    let expected = Poseidon2Sponge::hash(input, input.len());
    assert(spongeblob.squeeze() == expected);
}

#[test(should_fail_with = "Given in_len to absorb is larger than the input array len")]
unconstrained fn absorb_incorrect_in_len() {
    let mut spongeblob = SpongeBlob::new(10);
    let input_3 = [1, 2, 3];
    // The below should fail, as we try to absorb 10 inputs but only provide 3
    spongeblob.absorb(input_3, 10);
}
