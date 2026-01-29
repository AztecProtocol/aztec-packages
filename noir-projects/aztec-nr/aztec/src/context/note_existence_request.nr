use crate::protocol::address::aztec_address::AztecAddress;

/// A request to assert the existence of a note.
///
/// Used by [crate::context::PrivateContext::assert_note_exists].
pub struct NoteExistenceRequest {
    note_hash: Field,
    maybe_contract_address: Option<AztecAddress>,
}

impl NoteExistenceRequest {
    /// Creates an existence request for a pending note.
    ///
    /// Pending notes have not been yet assigned a nonce, and they therefore have no unique note hash. Instead, these
    /// requests are created using the unsiloed note hash (i.e. from
    /// [crate::note::note_interface::NoteHash::compute_note_hash]) and address of the contract that created the note.
    pub fn for_pending(unsiloed_note_hash: Field, contract_address: AztecAddress) -> Self {
        // The kernel doesn't take options; it takes a note_hash and an address, and infers whether the request is
        // siloed based on whether the address is zero or non-zero. When passing the value to the kernel, we use
        // `maybe_addr.unwrap_or(Address::ZERO)`. Therefore, passing a zero address to `for_pending` is not allowed
        // since it would be interpreted by the kernel as a settled request.
        assert(!contract_address.is_zero(), "Can't read a transient note with a zero contract address");
        Self { note_hash: unsiloed_note_hash, maybe_contract_address: Option::some(contract_address) }
    }

    /// Creates an existence request for a settled note.
    ///
    /// Unlike pending notes, settled notes have a nonce, and their existence request is created using the unique note
    /// hash.
    pub fn for_settled(unique_note_hash: Field) -> Self {
        Self { note_hash: unique_note_hash, maybe_contract_address: Option::none() }
    }

    pub(crate) fn note_hash(self) -> Field {
        self.note_hash
    }

    pub(crate) fn maybe_contract_address(self) -> Option<AztecAddress> {
        self.maybe_contract_address
    }
}
