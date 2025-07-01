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
