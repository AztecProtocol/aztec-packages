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
    // Inbox rolling-hash chain value after consuming all L1-to-L2 messages bundled into this checkpoint (AZIP-22 Fast
    // Inbox): the truncated-to-field sha256 chain the L1 Inbox accumulates. This is the checkpoint's only inbox
    // commitment.
    pub inbox_rolling_hash: Field,
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
    pub accumulated_fees: Field,
}

impl Empty for CheckpointHeader {
    fn empty() -> Self {
        Self {
            last_archive_root: 0,
            block_headers_hash: 0,
            blobs_hash: 0,
            inbox_rolling_hash: 0,
            epoch_out_hash: 0,
            slot_number: 0,
            timestamp: 0,
            coinbase: EthAddress::zero(),
            fee_recipient: AztecAddress::zero(),
            gas_fees: GasFees::empty(),
            total_mana_used: 0,
            accumulated_fees: 0,
        }
    }
}

impl CheckpointHeader {
    pub fn to_be_bytes(self) -> [u8; CHECKPOINT_HEADER_SIZE_IN_BYTES] {
        let last_archive_root_bytes: [u8; 32] = self.last_archive_root.to_be_bytes();
        let block_headers_hash_bytes: [u8; 32] = self.block_headers_hash.to_be_bytes();
        let blobs_hash_bytes: [u8; 32] = self.blobs_hash.to_be_bytes();
        let inbox_rolling_hash_bytes: [u8; 32] = self.inbox_rolling_hash.to_be_bytes();
        let epoch_out_hash_bytes: [u8; 32] = self.epoch_out_hash.to_be_bytes();
        let slot_number_bytes: [u8; 32] = self.slot_number.to_be_bytes();
        let timestamp_bytes: [u8; 8] = (self.timestamp as Field).to_be_bytes();
        // `coinbase` originates as an unchecked `EthAddress` field in `GlobalVariables`. Validate that
        // it fits in 20 bytes before truncating; otherwise the high bits would be silently dropped here
        // while the L1 contract reconstructs the hash from the full 20-byte coinbase, rejecting the proof.
        self.coinbase.validate();
        let coinbase_bytes: [u8; 20] = self.coinbase.to_be_bytes();
        let fee_recipient_bytes: [u8; 32] = self.fee_recipient.to_field().to_be_bytes();
        let gas_fees_per_da_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_da_gas as Field).to_be_bytes();
        let gas_fees_per_l2_gas_bytes: [u8; 16] =
            (self.gas_fees.fee_per_l2_gas as Field).to_be_bytes();
        let total_mana_used_bytes: [u8; 32] = self.total_mana_used.to_be_bytes();
        let accumulated_fees_bytes: [u8; 32] = self.accumulated_fees.to_be_bytes();

        last_archive_root_bytes
            .concat(block_headers_hash_bytes)
            .concat(blobs_hash_bytes)
            .concat(inbox_rolling_hash_bytes)
            .concat(epoch_out_hash_bytes)
            .concat(slot_number_bytes)
            .concat(timestamp_bytes)
            .concat(coinbase_bytes)
            .concat(fee_recipient_bytes)
            .concat(gas_fees_per_da_gas_bytes)
            .concat(gas_fees_per_l2_gas_bytes)
            .concat(total_mana_used_bytes)
            .concat(accumulated_fees_bytes)
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
    let empty_checkpoint_header_hash_from_ts = 0x002e384af86a480f952aa16443fd29646a9063865e62d7c403fc7ed697bb7712;

    assert_eq(header.hash(), empty_checkpoint_header_hash_from_ts);
}

#[test]
fn checkpoint_header_hash_matches_ts() {
    let header = CheckpointHeader {
        last_archive_root: 123,
        block_headers_hash: 456,
        blobs_hash: 77,
        inbox_rolling_hash: 89,
        epoch_out_hash: 99,
        slot_number: 1234,
        timestamp: 5678,
        coinbase: EthAddress::from_field(9090),
        fee_recipient: AztecAddress::from_field(101010),
        gas_fees: GasFees { fee_per_da_gas: 100, fee_per_l2_gas: 200 },
        total_mana_used: 151617,
        accumulated_fees: 181920,
    };
    // We use the CHECKPOINT_HEADER_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; CHECKPOINT_HEADER_LENGTH] = header.serialize();
    let deserialized = CheckpointHeader::deserialize(serialized);
    assert_eq(deserialized, header);

    // Generated from checkpoint_header.test.ts
    let checkpoint_header_hash_from_ts = 0x00751391e842cd7b2014478255dd3309df86327197a0feb03f0af1b758f62ba5;

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
        inbox_rolling_hash: MAX_FIELD_VALUE - 89,
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
        accumulated_fees: MAX_FIELD_VALUE - 181920,
    };

    let serialized: [Field; CHECKPOINT_HEADER_LENGTH] = header.serialize();
    let deserialized = CheckpointHeader::deserialize(serialized);
    assert_eq(deserialized, header);

    // Generated from checkpoint_header.test.ts
    let checkpoint_header_hash_large_values_from_ts = 0x005bd09725c6e77a4a28a7ccdaf7875ba5882431ca3c82e62db96e8a12769ce5;

    assert_eq(header.hash(), checkpoint_header_hash_large_values_from_ts);
}

#[test]
fn checkpoint_header_hash_accepts_max_20_byte_coinbase() {
    // The largest value that fits in 20 bytes is valid and must hash without panicking.
    let max_20_bytes = 2.pow_32(160) - 1;
    let mut header = CheckpointHeader::empty();
    header.coinbase = EthAddress::from_field(max_20_bytes);
    let _ = header.hash();
}

#[test(should_fail)]
fn checkpoint_header_hash_rejects_oversized_coinbase() {
    // A coinbase that does not fit in 20 bytes must be rejected by `coinbase.validate()` before the
    // value is truncated and hashed. `deserialize` bypasses `from_field`'s range check, so we can
    // construct an out-of-range coinbase (2^160 needs 161 bits).
    let over_20_bytes = 2.pow_32(160);
    let mut header = CheckpointHeader::empty();
    header.coinbase = EthAddress::deserialize([over_20_bytes]);
    let _ = header.hash();
}
