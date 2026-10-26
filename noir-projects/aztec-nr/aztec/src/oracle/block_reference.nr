use crate::protocol::traits::{Deserialize, Serialize};

/// A block, identified by its number and hash.
#[derive(Deserialize, Eq, Serialize)]
pub struct BlockReference {
    pub block_number: u32,
    pub block_hash: Field,
}
