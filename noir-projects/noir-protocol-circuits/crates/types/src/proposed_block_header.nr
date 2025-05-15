use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    constants::PROPOSED_BLOCK_HEADER_LENGTH_BYTES,
    content_commitment::ContentCommitment,
    hash::sha256_to_field,
    traits::{Deserialize, Empty, Hash, ToField},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct ProposedBlockHeader {
    pub last_archive_root: Field,
    pub content_commitment: ContentCommitment,

    // Partial global_variables:
    pub slot_number: Field,
    pub timestamp: u64,
    pub coinbase: EthAddress,
    pub fee_recipient: AztecAddress,
    pub gas_fees: GasFees,

    pub total_mana_used: Field,
}

impl Empty for ProposedBlockHeader {
    fn empty() -> Self {
        Self {
            last_archive_root: 0,
            content_commitment: ContentCommitment::empty(),
            slot_number: 0,
            timestamp: 0,
            coinbase: EthAddress::zero(),
            fee_recipient: AztecAddress::zero(),
            gas_fees: GasFees::empty(),
            total_mana_used: 0,
        }
    }
}

impl ProposedBlockHeader {
    pub fn to_be_bytes(self) -> [u8; PROPOSED_BLOCK_HEADER_LENGTH_BYTES] {
        let mut bytes = [0; PROPOSED_BLOCK_HEADER_LENGTH_BYTES];

        let last_archive_root_bytes: [u8; 32] = self.last_archive_root.to_be_bytes();
        let num_txs_bytes: [u8; 32] = self.content_commitment.num_txs.to_be_bytes();
        let blobs_hash_bytes: [u8; 32] = self.content_commitment.blobs_hash.to_be_bytes();
        let in_hash_bytes: [u8; 32] = self.content_commitment.in_hash.to_be_bytes();
        let out_hash_bytes: [u8; 32] = self.content_commitment.out_hash.to_be_bytes();
        let slot_number_bytes: [u8; 32] = self.slot_number.to_be_bytes();
        let coinbase_bytes: [u8; 20] = self.coinbase.to_be_bytes();
        let fee_recipient_bytes: [u8; 32] = self.fee_recipient.to_field().to_be_bytes();
        let gas_fees_per_da_gas_bytes: [u8; 32] = self.gas_fees.fee_per_da_gas.to_be_bytes();
        let gas_fees_per_l2_gas_bytes: [u8; 32] = self.gas_fees.fee_per_l2_gas.to_be_bytes();
        let total_mana_used_bytes: [u8; 32] = self.total_mana_used.to_be_bytes();

        for i in 0..32 {
            bytes[i] = last_archive_root_bytes[i];
            bytes[i + 0x20] = num_txs_bytes[i];
            bytes[i + 0x40] = blobs_hash_bytes[i];
            bytes[i + 0x60] = in_hash_bytes[i];
            bytes[i + 0x80] = out_hash_bytes[i];
            bytes[i + 0xa0] = slot_number_bytes[i];
        }

        let mut timestamp = self.timestamp;
        for i in 0..8 {
            bytes[0xc8 - 1 - i] = timestamp as u8;
            timestamp = timestamp >> 8;
        }

        for i in 0..20 {
            bytes[i + 0xc8] = coinbase_bytes[i];
        }

        for i in 0..32 {
            bytes[i + 0xdc] = fee_recipient_bytes[i];
            bytes[i + 0xfc] = gas_fees_per_da_gas_bytes[i];
            bytes[i + 0x11c] = gas_fees_per_l2_gas_bytes[i];
            bytes[i + 0x13c] = total_mana_used_bytes[i];
        }

        bytes
    }
}

impl Hash for ProposedBlockHeader {
    fn hash(self) -> Field {
        sha256_to_field(self.to_be_bytes())
    }
}

#[test]
fn serialization_of_empty() {
    let header = ProposedBlockHeader::empty();
    let serialized = header.serialize();
    let deserialized = ProposedBlockHeader::deserialize(serialized);
    assert(header.eq(deserialized));
}

#[test]
fn empty_hash_is_zero() {
    let header = ProposedBlockHeader::empty();
    let hash = header.hash();

    // Value from proposed_block_header.test.ts "computes empty hash" test
    let test_data_empty_hash = 0x002e384af86a480f952aa16443fd29646a9063865e62d7c403fc7ed697bb7712;
    assert_eq(hash, test_data_empty_hash);
}
