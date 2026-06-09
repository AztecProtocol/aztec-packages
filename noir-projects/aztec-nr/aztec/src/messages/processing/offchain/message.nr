use crate::{
    messages::encoding::MESSAGE_CIPHERTEXT_LEN,
    oracle::entity_store::EntityBody,
    protocol::{address::AztecAddress, hash::{poseidon2_hash, sha256_to_field}, traits::{Deserialize, Serialize}},
};

/// Entity type id shared by every offchain message reception entity in the entity store.
pub(crate) global OFFCHAIN_RECEPTION_ENTITY: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_ENTITY".as_bytes());

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

impl EntityBody for OffchainMessage {
    /// All offchain messages share the reception state-machine entity type.
    fn entity_type_id() -> Field {
        OFFCHAIN_RECEPTION_ENTITY
    }

    /// Computes the entity id that identifies this message's reception entity in the entity store.
    ///
    /// The id is a poseidon2 hash over the serialized ciphertext fields and the normalized tx hash (0 when absent).
    /// Re-delivering the same `(ciphertext, tx_hash)` pair therefore maps to the same entity, making receive
    /// idempotent. The `recipient` and `anchor_block_timestamp` fields are intentionally excluded, so identity
    /// depends only on the message content and its originating transaction.
    fn entity_id(self) -> Field {
        let serialized_ciphertext: [Field; SERIALIZED_CIPHERTEXT_LEN] = self.ciphertext.serialize();
        let mut inputs: [Field; SERIALIZED_CIPHERTEXT_LEN + 1] = [0; SERIALIZED_CIPHERTEXT_LEN + 1];
        for i in 0..SERIALIZED_CIPHERTEXT_LEN {
            inputs[i] = serialized_ciphertext[i];
        }
        inputs[SERIALIZED_CIPHERTEXT_LEN] = self.tx_hash.unwrap_or(0);
        poseidon2_hash(inputs)
    }
}
