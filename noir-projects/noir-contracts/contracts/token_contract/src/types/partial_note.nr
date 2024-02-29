use dep::aztec::{
    oracle::debug_log::debug_log_format,
    protocol_types::{hash::pedersen_hash, traits::{ToField, Serialize, Deserialize}, address::AztecAddress}
};

struct PartialNotesHash {
  inner: Field
}

impl ToField for PartialNotesHash {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl Serialize<1> for PartialNotesHash {
    fn serialize(self) -> [Field; 1] {
        [self.inner]
    }
}

impl Deserialize<1> for PartialNotesHash {
    fn deserialize(data: [Field; 1]) -> PartialNotesHash {
        PartialNotesHash {
            inner: data[0]
        }
    }
}

pub fn compute_partial_notes_pair_hash(
    partial_note_1: Field,
    partial_note_2: Field,
    completer: AztecAddress,
    amount: Field
) -> PartialNotesHash {
    let inner = pedersen_hash(
        [partial_note_1, partial_note_2, completer.to_field(), amount],
        0
    );

    debug_log_format(
        "hashing partial note auth\n\t - partial_note_1: {0}\n\t - partial_note_2: {1}\n\t - completer: {2}\n\t - amount: {3}\n\t - hash: {4}",
        [partial_note_1, partial_note_2, completer.to_field(), amount, inner]
    );

    PartialNotesHash { inner }
}
