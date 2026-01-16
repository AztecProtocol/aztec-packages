use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    constants::{
        CHECKPOINT_HEADER_LENGTH, CHECKPOINT_HEADER_SIZE_IN_BYTES, MAX_FIELD_VALUE, MAX_U64_VALUE,
    },
    hash::sha256_to_field,
    traits::{Deserialize, Empty, FromField, Hash, Serialize, ToField},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct CheckpointHeader {
    pub last_archive_root: Field,
    pub block_headers_hash: Field,
    pub blobs_hash: Field,
    pub in_hash: Field,
    // The root of the epoch out hash balanced tree. The out hash of the first checkpoint in the epoch is inserted at
    // index 0, the second at index 1, and so on.
    // Note: This is not necessarily the final epoch out hash. It includes only the out hashes of checkpoints up to and
    // including the current checkpoint. Any subsequent checkpoints added to the same epoch are not reflected in this
    // value.
    pub epoch_out_hash: Field,
    pub slot_number: Field,
    // The timestamp of the slot. All blocks in the checkpoint share the same timestamp, which must equal to this value.
    pub timestamp: u64,
    pub coinbase: EthAddress,
    // This field is an optional arbitrary l2 address set by the block builder. It's unchecked, and allows
    // off chain functionality between builders and tx submitters.
    pub fee_recipient: AztecAddress,
    pub gas_fees: GasFees,
    pub total_mana_used: Field,
}

impl Empty for CheckpointHeader {
    fn empty() -> Self {
        Self {
            last_archive_root: 0,
            block_headers_hash: 0,
            blobs_hash: 0,
            in_hash: 0,
            epoch_out_hash: 0,
            slot_number: 0,
            timestamp: 0,
            coinbase: EthAddress::zero(),
            fee_recipient: AztecAddress::zero(),
            gas_fees: GasFees::empty(),
            total_mana_used: 0,
        }
    }
}

impl CheckpointHeader {
    pub fn to_be_bytes(self) -> [u8; CHECKPOINT_HEADER_SIZE_IN_BYTES] {
        let mut bytes = [0; CHECKPOINT_HEADER_SIZE_IN_BYTES];

        let last_archive_root_bytes: [u8; 32] = self.last_archive_root.to_be_bytes();
        let block_headers_hash_bytes: [u8; 32] = self.block_headers_hash.to_be_bytes();
        let blobs_hash_bytes: [u8; 32] = self.blobs_hash.to_be_bytes();
        let in_hash_bytes: [u8; 32] = self.in_hash.to_be_bytes();
        let epoch_out_hash_bytes: [u8; 32] = self.epoch_out_hash.to_be_bytes();
        let slot_number_bytes: [u8; 32] = self.slot_number.to_be_bytes();
        let coinbase_bytes: [u8; 20] = self.coinbase.to_be_bytes();
        let fee_recipient_bytes: [u8; 32] = self.fee_recipient.to_field().to_be_bytes();
        let gas_fees_per_da_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_da_gas as Field).to_be_bytes();
        let gas_fees_per_l2_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_l2_gas as Field).to_be_bytes();
        let total_mana_used_bytes: [u8; 32] = self.total_mana_used.to_be_bytes();

        let mut offset = 0;
        for i in 0..32 {
            offset = 0;
            bytes[i] = last_archive_root_bytes[i];
            offset += last_archive_root_bytes.len();
            bytes[i + offset] = block_headers_hash_bytes[i];
            offset += block_headers_hash_bytes.len();
            bytes[i + offset] = blobs_hash_bytes[i];
            offset += blobs_hash_bytes.len();
            bytes[i + offset] = in_hash_bytes[i];
            offset += in_hash_bytes.len();
            bytes[i + offset] = epoch_out_hash_bytes[i];
            offset += epoch_out_hash_bytes.len();
            bytes[i + offset] = slot_number_bytes[i];
            offset += slot_number_bytes.len();
        }

        let mut timestamp = self.timestamp;
        offset += 8;
        for i in 0..8 {
            bytes[offset - 1 - i] = timestamp as u8;
            timestamp = timestamp >> 8;
        }

        for i in 0..20 {
            bytes[i + offset] = coinbase_bytes[i];
        }
        offset += coinbase_bytes.len();

        for i in 0..32 {
            bytes[i + offset] = fee_recipient_bytes[i];
        }
        offset += fee_recipient_bytes.len();

        for i in 0..16 {
            bytes[i + offset] = gas_fees_per_da_gas_bytes[i];
            bytes[i + offset + 16] = gas_fees_per_l2_gas_bytes[i];
        }
        offset += gas_fees_per_da_gas_bytes.len() + gas_fees_per_l2_gas_bytes.len();

        for i in 0..32 {
            bytes[i + offset] = total_mana_used_bytes[i];
        }

        bytes
    }
}

impl Hash for CheckpointHeader {
    fn hash(self) -> Field {
        sha256_to_field(self.to_be_bytes())
    }
}

#[test]
fn empty_checkpoint_header_hash_matches_ts() {
    let header = CheckpointHeader::empty();

    // Generated from checkpoint_header.test.ts
    let empty_checkpoint_header_hash_from_ts =
        0x007802c95d2f1ade746d97350a18ddbfdb9f5bee2803436917a3cf3d6a685a3a;

    assert_eq(header.hash(), empty_checkpoint_header_hash_from_ts);
}

#[test]
fn checkpoint_header_hash_matches_ts() {
    let header = CheckpointHeader {
        last_archive_root: 123,
        block_headers_hash: 456,
        blobs_hash: 77,
        in_hash: 88,
        epoch_out_hash: 99,
        slot_number: 1234,
        timestamp: 5678,
        coinbase: EthAddress::from_field(9090),
        fee_recipient: AztecAddress::from_field(101010),
        gas_fees: GasFees { fee_per_da_gas: 100, fee_per_l2_gas: 200 },
        total_mana_used: 151617,
    };
    // We use the CHECKPOINT_HEADER_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; CHECKPOINT_HEADER_LENGTH] = header.serialize();
    let deserialized = CheckpointHeader::deserialize(serialized);
    assert_eq(deserialized, header);

    // Generated from checkpoint_header.test.ts
    let checkpoint_header_hash_from_ts =
        0x007df45447387f2e48b4acae48b6c7f72eb63a9f6611c2f665df39f013a20dcf;

    assert_eq(header.hash(), checkpoint_header_hash_from_ts);
}

#[test]
fn checkpoint_header_hash_large_values_matches_ts() {
    let max_bytes_20 = 2.pow_32(160) - 1;
    let max_bytes_16 = (2.pow_32(128) - 1) as u128;
    let header = CheckpointHeader {
        last_archive_root: MAX_FIELD_VALUE - 123,
        block_headers_hash: MAX_FIELD_VALUE - 456,
        blobs_hash: MAX_FIELD_VALUE - 77,
        in_hash: MAX_FIELD_VALUE - 88,
        epoch_out_hash: MAX_FIELD_VALUE - 99,
        slot_number: MAX_FIELD_VALUE - 1234,
        timestamp: MAX_U64_VALUE - 5678,
        coinbase: EthAddress::from_field(max_bytes_20 - 9090),
        fee_recipient: AztecAddress::from_field(MAX_FIELD_VALUE - 101010),
        gas_fees: GasFees {
            fee_per_da_gas: max_bytes_16 - 100,
            fee_per_l2_gas: max_bytes_16 - 200,
        },
        total_mana_used: MAX_FIELD_VALUE - 151617,
    };

    let serialized: [Field; CHECKPOINT_HEADER_LENGTH] = header.serialize();
    let deserialized = CheckpointHeader::deserialize(serialized);
    assert_eq(deserialized, header);

    // Generated from checkpoint_header.test.ts
    let checkpoint_header_hash_large_values_from_ts =
        0x00f074f614b5872bfea51e9b457ef2bf61e8c8afa842baaae05f77d885852d3c;

    assert_eq(header.hash(), checkpoint_header_hash_large_values_from_ts);
}
