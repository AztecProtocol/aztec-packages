use dep::aztec::{
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
        utils::compute_note_hash_for_read_or_nullify,
    },
    context::PrivateContext,
    constants_gen::MAX_READ_REQUESTS_PER_CALL,
    state_vars::set::Set,
    log::emit_encrypted_log,
    hash::pedersen_hash,
    types::address::AztecAddress,
    oracle::{
        rand::rand,
        get_secret_key::get_secret_key,
        get_public_key::get_public_key,
    },
};
use dep::safe_math::SafeU120;
use dep::std::option::Option;

global LP_NOTE_LEN: Field = 3; // 3 plus a header.

struct LPNote {
    // the amount of LP tokens in the note
    amount: SafeU120,
    // the provider of secrets for the nullifier. The owner (recipient) to ensure that the note 
    // can be privately spent. When nullifier secret and encryption private key is same 
    // we can simply use the owner for this one.
    owner: AztecAddress,
    // randomness of the note to hide contents.
    randomness: Field,
    // the note header (contract_address, nonce, storage_slot)
    // included in the note such that it becomes part of encrypted logs for later use.
    header: NoteHeader,
}

impl LPNote {
    pub fn new(amount: SafeU120, owner: AztecAddress) -> Self {
        Self {
            amount,
            owner,
            randomness: rand(),
            header: NoteHeader::empty(),
        }
    }

    pub fn serialize(self) -> [Field; LP_NOTE_LEN] {
        [self.amount.value as Field, self.owner.address, self.randomness]
    }

    pub fn deserialize(serialized_note: [Field; LP_NOTE_LEN]) -> Self {
        Self {
            amount: SafeU120::new(serialized_note[0]),
            owner: AztecAddress::new(serialized_note[1]),
            randomness: serialized_note[2],
            header: NoteHeader::empty(),
        }
    }

    pub fn compute_note_hash(self) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            self.amount.value as Field, 
            self.owner.address as Field,
            self.randomness,
        ],0)
    }

    // docs:start:nullifier
    pub fn compute_nullifier(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_read_or_nullify(LPNoteMethods, self);
        let secret = get_secret_key(self.owner.address);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }
    // docs:end:nullifier

    pub fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    // Broadcasts the note as an encrypted log on L1.
    pub fn broadcast(self, context: &mut PrivateContext, slot: Field) {
      // We only bother inserting the note if non-empty to save funds on gas.
      if !self.amount.is_zero() {
          let encryption_pub_key = get_public_key(self.owner.address);
          emit_encrypted_log(
              context,
              (*context).this_address(),
              slot,
              encryption_pub_key,
              self.serialize(),
          );
      }
  }
}

fn deserialize(serialized_note: [Field; LP_NOTE_LEN]) -> LPNote {
    LPNote::deserialize(serialized_note)
}

fn serialize(note: LPNote) -> [Field; LP_NOTE_LEN] {
    note.serialize()
}

fn compute_note_hash(note: LPNote) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: LPNote) -> Field {
    note.compute_nullifier()
}

fn get_header(note: LPNote) -> NoteHeader {
    note.header
}

fn set_header(note: &mut LPNote, header: NoteHeader) {
    note.set_header(header)
}

// Broadcasts the note as an encrypted log on L1.
fn broadcast(context: &mut PrivateContext, slot: Field, note: LPNote) {
    note.broadcast(context, slot);
}

global LPNoteMethods = NoteInterface {
    deserialize,
    serialize,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
    broadcast,
};