use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AppendOnlyTreeSnapshot {
    pub root: Field,
    // TODO(Alvaro) change this to a u64
    pub next_available_leaf_index: u32,
}

impl Empty for AppendOnlyTreeSnapshot {
    fn empty() -> Self {
        Self { root: 0, next_available_leaf_index: 0 }
    }
}
