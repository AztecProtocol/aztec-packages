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

impl OffchainMessage {
    /// Computes the fact-collection id that identifies this message's reception in the fact store.
    ///
    /// The id is a poseidon2 hash over the full serialized message. Re-delivering a byte-identical message therefore
    /// maps to the same collection, making `receive` idempotent; a message differing in any field (recipient,
    /// tx hash, anchor timestamp, or ciphertext) is a distinct reception.
    pub fn fact_collection_id(self) -> Field {
        poseidon2_hash(self.serialize())
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
