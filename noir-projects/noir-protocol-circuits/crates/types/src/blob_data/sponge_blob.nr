use crate::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables,
        state_reference::StateReference,
    },
    constants::{BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, SPONGE_BLOB_LENGTH, TWO_POW_64},
    poseidon2::Poseidon2Sponge,
    traits::{Deserialize, Empty, Serialize},
};
use super::{
    block_blob_data::create_block_end_blob_data,
    checkpoint_blob_data::create_checkpoint_end_marker,
    tx_blob_data::{create_tx_blob_data, TxEffectArrayLengths},
    tx_effect::TxEffect,
};

/// A Poseidon2 sponge used to accumulate data that will be added to blob(s).
/// (More accurately called BlobSponge, but that's not as fun).
///
/// The journey of a SpongeBlob:
///
/// Tx base: each tx absorbs its effects into the given "start" SpongeBlob and outputs it as the "end" SpongeBlob.
///
/// Tx merge or block root checks that the start SpongeBlob of a tx matches the end SpongeBlob of the previous tx.
///
/// Block root: the end SpongeBlob of the last tx absorbs a special block end marker indicating the number of txs in
/// the block, along with the end state of the block. The block header commits to the value squeezed from this
/// SpongeBlob. This updated SpongeBlob is then output as the end SpongeBlob of the block root.
///
/// In block merge or checkpoint root, the start SpongeBlob is checked against the end SpongeBlob of the previous block.
///
/// Checkpoint root: receives all fields as private inputs and checks that hashing them matches the final hash squeezed
/// from the end SpongeBlob of the last block, after absorbing a checkpoint end marker indicating the number of fields
/// absorbed. It also checks that the start SpongeBlob of the first tx in the block does not have any fields absorbed.
///
/// The final hash is used as part of the blob challenge, proving that all fields of the blob(s) are included.
///
/// Note: The hash squeezed from the SpongeBlob is NOT a standard poseidon2 hash.
#[derive(Deserialize, Eq, Serialize)]
pub struct SpongeBlob {
    pub sponge: Poseidon2Sponge,
    // The number of fields absorbed so far.
    pub num_absorbed_fields: u32,
}

impl SpongeBlob {
    /// Initialize the sponge with the maximum number of fields allowed in a checkpoint.
    /// This allows proposers to start creating blocks and signing block headers (which contain the hash squeezed from
    /// the this sponge) before receiving all txs in a checkpoint slot.
    pub fn init() -> Self {
        let iv = (BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB) as Field * TWO_POW_64;
        Self { sponge: Poseidon2Sponge::new(iv), num_absorbed_fields: 0 }
    }

    pub fn absorb_tx_blob_data(
        &mut self,
        tx_effect: TxEffect,
        array_lengths: TxEffectArrayLengths,
    ) {
        let (tx_blob_data, num_blob_fields) = create_tx_blob_data(tx_effect, array_lengths);
        self.absorb(tx_blob_data, num_blob_fields);
    }

    pub fn absorb_block_end_data(
        &mut self,
        global_variables: GlobalVariables,
        last_archive: AppendOnlyTreeSnapshot,
        state: StateReference,
        num_txs: u16,
        total_mana_used: Field,
        is_first_block_in_checkpoint: bool,
    ) {
        let blob_data = create_block_end_blob_data(
            global_variables,
            last_archive,
            state,
            num_txs,
            total_mana_used,
        );

        // Include the last field (the l1-to-l2 message tree root) only for the first block, since this value is the
        // same for all blocks in the checkpoint.
        let num_blob_data_to_absorb = if is_first_block_in_checkpoint {
            blob_data.len()
        } else {
            blob_data.len() - 1
        };

        self.absorb(blob_data, num_blob_data_to_absorb);
    }

    pub fn absorb_checkpoint_end_marker(&mut self) {
        self.num_absorbed_fields += 1;
        let end_marker = create_checkpoint_end_marker(self.num_absorbed_fields);
        self.sponge.absorb(end_marker);
    }

    /// Absorb the first `in_len` fields of the `input` to the sponge. Fields beyond `in_len` are ignored.
    pub fn absorb<let N: u32>(&mut self, input: [Field; N], in_len: u32) {
        self.sponge =
            crate::hash::poseidon2_absorb_in_chunks_existing_sponge(self.sponge, input, in_len);
        self.num_absorbed_fields += in_len;
    }

    /// Finalize the sponge and output the non-standard poseidon2 hash of all fields absorbed.
    pub fn squeeze(&mut self) -> Field {
        self.sponge.squeeze()
    }
}

impl Empty for SpongeBlob {
    fn empty() -> Self {
        Self { sponge: Poseidon2Sponge::new(0), num_absorbed_fields: 0 }
    }
}

#[test]
fn test_sponge_blob_serialization() {
    let item = SpongeBlob { sponge: Poseidon2Sponge::new(123), num_absorbed_fields: 456 };

    // We use the SPONGE_BLOB_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; SPONGE_BLOB_LENGTH] = item.serialize();
    let deserialized = SpongeBlob::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
unconstrained fn absorb_in_chunks() {
    // This tests that absorbing two arrays separately then squeezing matches absorbing everything as a single array.
    let mut chunk_sponge = SpongeBlob::init();
    let array0 = [1, 2, 3];
    chunk_sponge.absorb(array0, array0.len());
    assert_eq(chunk_sponge.num_absorbed_fields, array0.len());
    // Absorb the next 4 fields in a new call...
    let array1 = [4, 5, 6, 7];
    chunk_sponge.absorb(array1, array1.len());
    assert_eq(chunk_sponge.num_absorbed_fields, array0.len() + array1.len());

    let combined = array0.concat(array1);
    let mut expected = SpongeBlob::init();
    expected.absorb(combined, combined.len());

    assert_eq(chunk_sponge, expected);

    let chunk_sponge_hash = chunk_sponge.squeeze();
    assert_eq(chunk_sponge_hash, expected.squeeze());
}

#[test(should_fail_with = "Given in_len to absorb is larger than the input array len")]
unconstrained fn absorb_incorrect_in_len() {
    let mut sponge_blob = SpongeBlob::init();
    let input_3 = [1, 2, 3];
    // The below should fail, as we try to absorb 10 inputs but only provide 3
    sponge_blob.absorb(input_3, 10);
}

#[test]
fn should_not_absorb_more_than_len() {
    let mut sponge_blob = SpongeBlob::init();
    sponge_blob.absorb([1, 2, 3], 1);
    sponge_blob.absorb([4, 5, 6], 1);
    sponge_blob.absorb([7, 8, 9], 1);

    let mut expected = SpongeBlob::init();
    expected.absorb([1, 4, 7], 3);

    assert_eq(sponge_blob, expected);

    // The following is generated from 'yarn-project/blob-lib/src/sponge_blob.test.ts'.
    let small_sponge_hash_from_ts =
        0x142a2d54d67841d1ab00580036a6bb63e7ff8c1bc4ca5232628a9dde48bd55ae;

    assert_eq(sponge_blob.squeeze(), small_sponge_hash_from_ts);
}

#[test]
unconstrained fn full_sponge_hash_match_typescript() {
    let mut fields = [0; BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB];
    for i in 0..fields.len() {
        fields[i] = (i as Field) + 123;
    }

    let mut sponge_blob = SpongeBlob::init();
    sponge_blob.absorb(fields, fields.len());

    // The following is generated from 'yarn-project/blob-lib/src/sponge_blob.test.ts'.
    let full_sponge_hash_from_ts =
        0x23f78d3bf4a9e4a96e28d05f4daaa32a91c93dac6e9903246dc69c2290e7a000;

    assert_eq(sponge_blob.squeeze(), full_sponge_hash_from_ts);
}
