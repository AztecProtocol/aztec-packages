use crate::{
    messages::encoding::MESSAGE_CIPHERTEXT_LEN,
    protocol::{address::AztecAddress, hash::{poseidon2_hash, sha256_to_field}, traits::{Deserialize, Serialize}},
};

/// Fact-collection type id shared by every offchain message reception in the fact store.
pub(crate) global OFFCHAIN_RECEPTION_TYPE: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_TYPE".as_bytes());

/// A message delivered via the `offchain_receive` utility function.
#[derive(Serialize, Deserialize)]
pub struct OffchainMessage {
    /// The encrypted message payload.
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    pub recipient: AztecAddress,
    /// The hash of the transaction that produced this message. `Option::none` indicates a tx-less message.
    pub tx_hash: Option<Field>,
    /// Anchor block timestamp at message emission.
    pub anchor_block_timestamp: u64,
}

/// Number of fields produced by serializing a `BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>`.
///
/// A `BoundedVec` serializes as its storage fields followed by a trailing length field, so the total is
/// `MESSAGE_CIPHERTEXT_LEN + 1`.
global SERIALIZED_CIPHERTEXT_LEN: u32 = MESSAGE_CIPHERTEXT_LEN + 1;

impl OffchainMessage {
    /// Computes the fact-collection id that identifies this message's reception in the fact store.
    ///
    /// The id is a poseidon2 hash over the serialized ciphertext fields and the normalized tx hash (0 when absent).
    /// Re-delivering the same `(ciphertext, tx_hash)` pair therefore maps to the same collection, making `receive`
    /// idempotent. The `recipient` and `anchor_block_timestamp` fields are intentionally excluded, so identity depends
    /// only on the message content and its originating transaction.
    pub fn fact_collection_id(self) -> Field {
        let serialized_ciphertext: [Field; SERIALIZED_CIPHERTEXT_LEN] = self.ciphertext.serialize();
        let mut inputs: [Field; SERIALIZED_CIPHERTEXT_LEN + 1] = [0; SERIALIZED_CIPHERTEXT_LEN + 1];
        for i in 0..SERIALIZED_CIPHERTEXT_LEN {
            inputs[i] = serialized_ciphertext[i];
        }
        inputs[SERIALIZED_CIPHERTEXT_LEN] = self.tx_hash.unwrap_or(0);
        poseidon2_hash(inputs)
    }
}

mod test {
    use crate::{
        messages::encoding::MESSAGE_CIPHERTEXT_LEN,
        protocol::{address::AztecAddress, traits::{Deserialize, FromField, Serialize}},
    };
    use super::OffchainMessage;

    #[test]
    unconstrained fn pack_unpack_round_trips_offchain_message() {
        let ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN> = BoundedVec::new();
        let msg = OffchainMessage {
            ciphertext,
            recipient: AztecAddress::from_field(42),
            tx_hash: Option::some(99),
            anchor_block_timestamp: 12345,
        };
        let packed = msg.serialize();
        let roundtripped: OffchainMessage = Deserialize::deserialize(packed);
        assert_eq(roundtripped.recipient, msg.recipient);
        assert_eq(roundtripped.tx_hash, msg.tx_hash);
        assert_eq(roundtripped.anchor_block_timestamp, msg.anchor_block_timestamp);
        assert_eq(roundtripped.ciphertext.len(), msg.ciphertext.len());
    }
}
