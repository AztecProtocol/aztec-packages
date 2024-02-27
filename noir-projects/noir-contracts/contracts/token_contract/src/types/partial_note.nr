use dep::aztec::{
    oracle::debug_log::debug_log_format,
    protocol_types::{hash::pedersen_hash, traits::{ToField, Serialize, Deserialize}, address::AztecAddress}
};

struct PartialNotePair {
  partial_note_1: Field,
  partial_note_2: Field,
  completer: AztecAddress,
  amount: Field,
}

impl PartialNotePair {
    fn hash(self) -> PartialNoteHash {
        let hash = pedersen_hash(
            [self.partial_note_1, self.partial_note_2, self.completer.to_field(), self.amount],
            0
        );

        debug_log_format(
            "hashing partial note auth\n\t - partial_note_1: {0}\n\t - partial_note_2: {1}\n\t - completer: {2}\n\t - amount: {3}\n\t - hash: {4}",
            [self.partial_note_1, self.partial_note_2, self.completer.to_field(), self.amount, hash]
        );

        PartialNoteHash { hash }
    }
}

struct PartialNoteHash {
  hash: Field
}

impl ToField for PartialNoteHash {
  fn to_field(self) -> Field {
    self.hash
  }
}

impl Serialize<1> for PartialNoteHash {
  fn serialize(self) -> [Field; 1] {
    [self.hash]
  }
}

impl Deserialize<1> for PartialNoteHash {
  fn deserialize(data: [Field; 1]) -> Self {
    PartialNoteHash { hash: data[0] }
  }
}
