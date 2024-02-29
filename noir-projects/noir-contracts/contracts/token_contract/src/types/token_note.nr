use dep::aztec::{
    protocol_types::{address::AztecAddress, constants::MAX_READ_REQUESTS_PER_CALL},
    note::{
    note_header::NoteHeader, note_interface::{NoteInterface, PartialNoteInterface},
    utils::compute_note_hash_for_consumption
},
    context::PrivateContext, log::emit_encrypted_log, hash::pedersen_hash
};
use dep::aztec::oracle::{rand::rand, nullifier_key::get_nullifier_secret_key, get_public_key::get_public_key};
use dep::std::option::Option;

trait OwnedNote {
    fn new(amount: U128, owner: AztecAddress) -> Self;
    fn get_amount(self) -> U128;
    fn get_owner(self) -> AztecAddress;
}

global TOKEN_NOTE_LEN: Field = 3; // 3 plus a header.

struct TokenNote {
    // the amount of tokens in the note
    amount: U128,
    // the provider of secrets for the nullifier. The owner (recipient) to ensure that the note
    // can be privately spent. When nullifier secret and encryption private key is same
    // we can simply use the owner for this one.
    owner: AztecAddress,
    // randomness of the note to hide contents.
    randomness: Field,
    // the note header (contract_address, nonce, storage_slot)
    // included in the note such that it becomes part of encrypted logs for later use.
    header: NoteHeader,

    private_content_hash: Field,
}

impl NoteInterface<TOKEN_NOTE_LEN> for TokenNote {
    fn serialize_content(self) -> [Field; TOKEN_NOTE_LEN] {
        [self.amount.to_field(), self.owner.to_field(), self.randomness]
    }

    fn deserialize_content(serialized_note: [Field; TOKEN_NOTE_LEN]) -> Self {
        Self {
            amount: U128::from_integer(serialized_note[0]),
            owner: AztecAddress::from_field(serialized_note[1]),
            randomness: serialized_note[2],
            header: NoteHeader::empty(),
            private_content_hash: 0,
        }
    }

    fn compute_note_content_hash(self) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            self.amount.to_field(),
        ], 0)
    }

    // docs:start:nullifier
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }
    // docs:end:nullifier

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    fn get_header(self) -> NoteHeader {
        self.header
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
      // We only bother inserting the note if non-empty to save funds on gas.
      if !(self.amount == U128::from_integer(0)) {
          let encryption_pub_key = get_public_key(self.owner);
          emit_encrypted_log(
              context,
              (*context).this_address(),
              slot,
              Self::get_note_type_id(),
              encryption_pub_key,
              self.serialize_content(),
          );
      }
    }

    fn get_note_type_id() -> Field {
        // TODO(#4519): autogenerate
        // python -c "print(int(''.join(str(ord(c)) for c in 'TokenNote')))"
        8411110710111078111116101
    }

    fn compute_note_private_content_hash(self) -> Field {
        if self.private_content_hash != 0 {
            self.private_content_hash
        } else {
            pedersen_hash(
                [
                self.owner.to_field(),
                self.randomness
            ],
                0
            )
        }
    }

    fn compute_note_public_content_hash(self) -> Field {
        pedersen_hash([
            self.amount.to_field(),
        ], 0)
    }
}

impl OwnedNote for TokenNote {
    fn new(amount: U128, owner: AztecAddress) -> Self {
        Self {
            amount,
            owner,
            randomness: rand(),
            header: NoteHeader::empty(),
            private_content_hash: 0
        }
    }

    fn get_amount(self) -> U128 {
        self.amount
    }

    fn get_owner(self) -> AztecAddress {
        self.owner
    }
}

impl PartialNoteInterface for TokenNote {
}

impl TokenNote {
    pub fn from_partial(amount: U128, private_content_hash: Field) -> Self {
        Self { amount, private_content_hash, owner: AztecAddress::empty(), randomness: 0, header: NoteHeader::empty() }
    }
}
