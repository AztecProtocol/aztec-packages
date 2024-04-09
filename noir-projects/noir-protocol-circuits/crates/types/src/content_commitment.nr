use crate::{
    constants::CONTENT_COMMITMENT_LENGTH, traits::{Deserialize, Hash, Serialize},
    utils::arr_copy_slice
};
use dep::std::default::Default;

struct ContentCommitment {
  tx_tree_height: Field,
  txs_effects_hash: Field,
  in_hash: Field,
  out_hash: Field,
}

impl Serialize<CONTENT_COMMITMENT_LENGTH> for ContentCommitment {
  fn serialize(self) -> [Field; CONTENT_COMMITMENT_LENGTH] {
    let mut fields: BoundedVec<Field, CONTENT_COMMITMENT_LENGTH> = BoundedVec::new();

    fields.push(self.tx_tree_height);
    fields.push(self.txs_effects_hash);
    fields.push(self.in_hash);
    fields.push(self.out_hash);

    fields.storage
  }
}

impl Deserialize<CONTENT_COMMITMENT_LENGTH> for ContentCommitment {
  fn deserialize(serialized: [Field; CONTENT_COMMITMENT_LENGTH]) -> Self {
    let tx_tree_height = serialized[0];

    let txs_effects_hash = serialized[1];

    let in_hash = serialized[2];

    let out_hash = serialized[3];

    Self {
      tx_tree_height,
      txs_effects_hash,
      in_hash,
      out_hash,
    }
  }
}

impl Default for ContentCommitment {
  fn default() -> Self {
    Self {
      tx_tree_height: 0,
      txs_effects_hash: 0,
      in_hash: 0,
      out_hash: 0,
    }
  }
}

impl Eq for ContentCommitment {
  fn eq(self, other: Self) -> bool {
    (self.tx_tree_height == other.tx_tree_height)
      & (self.txs_effects_hash == other.txs_effects_hash)
      & (self.in_hash == other.in_hash)
      & (self.out_hash == other.out_hash)
  }
}

#[test]
fn serialization_of_empty() {
    let empty = ContentCommitment::default();
    let serialized = empty.serialize();
    let deserialized = ContentCommitment::deserialize(serialized);

    assert(empty.eq(deserialized));
}
