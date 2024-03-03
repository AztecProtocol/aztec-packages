use dep::aztec::protocol_types::{hash::pedersen_hash, traits::{ToField, Serialize, Deserialize}, address::AztecAddress};

// helper struct to constrain a pair of partial notes to add up to a known amount
// it's a struct so that it implements ToField and can be used as a map key
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

    PartialNotesHash { inner }
}
