use crate::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ContentCommitment {
    pub num_txs: Field,
    pub blobs_hash: Field,
    pub in_hash: Field,
    pub out_hash: Field,
}

impl Empty for ContentCommitment {
    fn empty() -> Self {
        Self { num_txs: 0, blobs_hash: 0, in_hash: 0, out_hash: 0 }
    }
}

mod test {
    use crate::{
        constants::CONTENT_COMMITMENT_LENGTH,
        content_commitment::ContentCommitment,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let empty = ContentCommitment::empty();

        // We use the CONTENT_COMMITMENT_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; CONTENT_COMMITMENT_LENGTH] = empty.serialize();

        let deserialized = ContentCommitment::deserialize(serialized);

        assert(empty.eq(deserialized));
    }

}
