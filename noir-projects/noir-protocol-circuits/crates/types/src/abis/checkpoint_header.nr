use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    constants::{CHECKPOINT_HEADER_LENGTH, CHECKPOINT_HEADER_SIZE_IN_BYTES},
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
        let slot_number_bytes: [u8; 32] = self.slot_number.to_be_bytes();
        let coinbase_bytes: [u8; 20] = self.coinbase.to_be_bytes();
        let fee_recipient_bytes: [u8; 32] = self.fee_recipient.to_field().to_be_bytes();
        let gas_fees_per_da_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_da_gas as Field).to_be_bytes();
        let gas_fees_per_l2_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_l2_gas as Field).to_be_bytes();
        let total_mana_used_bytes: [u8; 32] = self.total_mana_used.to_be_bytes();

        for i in 0..32 {
            bytes[i] = last_archive_root_bytes[i];
            bytes[i + 32] = block_headers_hash_bytes[i];
            bytes[i + 64] = blobs_hash_bytes[i];
            bytes[i + 96] = in_hash_bytes[i];
            bytes[i + 128] = slot_number_bytes[i];
        }

        let mut timestamp = self.timestamp;
        for i in 0..8 {
            bytes[168 - 1 - i] = timestamp as u8;
            timestamp = timestamp >> 8;
        }

        for i in 0..20 {
            bytes[i + 168] = coinbase_bytes[i];
        }

        for i in 0..32 {
            bytes[i + 188] = fee_recipient_bytes[i];
        }

        for i in 0..16 {
            bytes[i + 220] = gas_fees_per_da_gas_bytes[i];
            bytes[i + 236] = gas_fees_per_l2_gas_bytes[i];
        }

        for i in 0..32 {
            bytes[i + 252] = total_mana_used_bytes[i];
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
        0x00d72511e843bf5a2e44e8bd1da20c2626311d1d6679424f717807a1db731d62;

    assert_eq(header.hash(), empty_checkpoint_header_hash_from_ts);
}

#[test]
fn checkpoint_header_hash_matches_ts() {
    let header = CheckpointHeader {
        last_archive_root: 123,
        block_headers_hash: 456,
        blobs_hash: 77,
        in_hash: 88,
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
        0x00710281705a29930cf34f3470280e346449cd5a5d551177db509d2b5d3a5f21;

    assert_eq(header.hash(), checkpoint_header_hash_from_ts);
}
