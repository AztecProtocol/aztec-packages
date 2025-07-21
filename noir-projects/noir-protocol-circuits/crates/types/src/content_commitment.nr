use crate::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ContentCommitment {
    pub blobs_hash: Field,
    pub in_hash: Field,
    pub out_hash: Field,
}

impl Empty for ContentCommitment {
    fn empty() -> Self {
        Self { blobs_hash: 0, in_hash: 0, out_hash: 0 }
    }
}

mod test {
    use crate::{
        constants::CONTENT_COMMITMENT_LENGTH,
        content_commitment::ContentCommitment,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn test_content_commitment_serialization() {
        let item = ContentCommitment { blobs_hash: 123, in_hash: 456, out_hash: 789 };
        // We use the CONTENT_COMMITMENT_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant
        let serialized: [Field; CONTENT_COMMITMENT_LENGTH] = item.serialize();
        let deserialized = ContentCommitment::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
