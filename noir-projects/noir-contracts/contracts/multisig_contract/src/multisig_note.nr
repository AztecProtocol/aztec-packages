use dep::aztec::protocol_types::address::AztecAddress;
use dep::aztec::{
    note::{note_header::NoteHeader, note_interface::NoteInterface, utils::compute_note_hash_for_consumption},
    oracle::{nullifier_key::get_nullifier_secret_key, get_public_key::get_public_key},
    log::emit_encrypted_log, hash::pedersen_hash, context::PrivateContext
};

global MAX_MULTISIG_OWNERS: Field = 5;
global MULTISIG_NOTE_LEN: Field = 10;

struct MultiSigNote {
    owners: [AztecAddress; MAX_MULTISIG_OWNERS],
    private_key: Field,  // encryption private key
    threshold: u8,    // threshold for the multi-sig
    contract_address: AztecAddress, // We store the address of the contract itself, only to get the secret key to compute the nullifier
    multisig_account_nonce: u32, // nonce of the multi-sig account, enables replay protection and transaction ordering
    broadcast_to_owners: bool, // broadcast to all owners or to the multisig itself
    header: NoteHeader,
}

impl NoteInterface<MULTISIG_NOTE_LEN> for MultiSigNote {
    fn serialize_content(self) -> [Field; MULTISIG_NOTE_LEN] {
        let mut serialized_note: [Field; MULTISIG_NOTE_LEN] = [0; MULTISIG_NOTE_LEN];
        for i in 0..MAX_MULTISIG_OWNERS {
            serialized_note[i] = self.owners[i].to_field();
        }
        serialized_note[MAX_MULTISIG_OWNERS] = self.private_key;
        serialized_note[MAX_MULTISIG_OWNERS + 1] = self.threshold as Field;
        serialized_note[MAX_MULTISIG_OWNERS + 2] = self.contract_address.to_field();
        serialized_note[MAX_MULTISIG_OWNERS + 3] = self.multisig_account_nonce as Field;
        // We are not going to serialize the broadcast_to_owners field, so it is a "transient" value that only exists before serlization/deserialization
        // serialized_note[MAX_MULTISIG_OWNERS + 4] = self.broadcast_to_owners as Field;
        serialized_note
    }

    fn deserialize_content(serialized_note: [Field; MULTISIG_NOTE_LEN]) -> MultiSigNote {
        let mut owners: [AztecAddress; MAX_MULTISIG_OWNERS] = [AztecAddress::zero(); MAX_MULTISIG_OWNERS];
        for i in 0..MAX_MULTISIG_OWNERS {
            owners[i] = AztecAddress::from_field(serialized_note[i]);
        }
        let private_key = serialized_note[MAX_MULTISIG_OWNERS];
        let threshold = serialized_note[MAX_MULTISIG_OWNERS + 1] as u8;
        let contract_address = AztecAddress::from_field(serialized_note[MAX_MULTISIG_OWNERS + 2]);
        let multisig_account_nonce = serialized_note[MAX_MULTISIG_OWNERS + 3] as u32;
        // broadcast_to_owners is always false when deserializing
        let broadcast_to_owners = false; 
        MultiSigNote { owners, private_key, threshold, contract_address, multisig_account_nonce, broadcast_to_owners, header: NoteHeader::empty() }
    }

    fn compute_note_content_hash(note: MultiSigNote) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash(note.serialize_content(), 0)
    }

   fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let unique_siloed_note_hash = compute_note_hash_for_consumption(self);
        let secret = context.request_nullifier_secret_key(self.contract_address);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            unique_siloed_note_hash,
            secret.low,
            secret.high,
        ],0)
    }

    fn compute_nullifier_without_context(self) -> Field {
        let unique_siloed_note_hash = compute_note_hash_for_consumption(self);
        let secret = get_nullifier_secret_key(self.contract_address);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            unique_siloed_note_hash,
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
        if(self.broadcast_to_owners == true) {
            for owner in self.owners {
                if !owner.is_zero() {
                    let encryption_pub_key = get_public_key(owner);
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
        } else {
            let encryption_pub_key = get_public_key(self.contract_address);
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
        666 + 777
    }
}

impl MultiSigNote {
    pub fn new(
        owners: [AztecAddress; MAX_MULTISIG_OWNERS],
        private_key: Field,
        threshold: u8,
        contract_address: AztecAddress,
        multisig_account_nonce: u32,
        broadcast_to_owners: bool
    ) -> MultiSigNote {
        MultiSigNote {
            owners,
            private_key,
            threshold,
            contract_address,
            multisig_account_nonce,
            broadcast_to_owners,
            header: NoteHeader::empty()
        }
    }
}
