use crate::protocol::address::aztec_address::AztecAddress;

/// A request to assert the existence of a nullifier.
///
/// Used by [crate::context::private_context::PrivateContext::assert_nullifier_exists].
pub struct NullifierExistenceRequest {
    nullifier: Field,
    maybe_contract_address: Option<AztecAddress>,
}

impl NullifierExistenceRequest {
    /// Creates an existence request for a pending nullifier.
    ///
    /// Pending nullifiers have not been siloed with the contract address. These requests are created using the
    /// unsiloed value and address of the contract that emitted the nullifier.
    pub fn for_pending(unsiloed_nullifier: Field, contract_address: AztecAddress) -> Self {
        // The kernel doesn't take options; it takes a nullifier and an address, and infers whether the request is
        // siloed based on whether the address is zero or non-zero. When passing the value to the kernel, we use
        // `maybe_addr.unwrap_or(Address::ZERO)`. Therefore, passing a zero address to `for_pending` is not allowed
        // since it would be interpreted by the kernel as a settled request.
        assert(!contract_address.is_zero(), "Can't read a pending nullifier with a zero contract address");
        Self { nullifier: unsiloed_nullifier, maybe_contract_address: Option::some(contract_address) }
    }

    /// Creates an existence request for a settled nullifier.
    ///
    /// Unlike pending nullifiers, settled nullifiers have been siloed with their contract addresses before adding to
    /// the nullifier tree, and their existence request is created using the siloed value.
    pub fn for_settled(siloed_nullifier: Field) -> Self {
        Self { nullifier: siloed_nullifier, maybe_contract_address: Option::none() }
    }

    pub(crate) fn nullifier(self) -> Field {
        self.nullifier
    }

    pub(crate) fn maybe_contract_address(self) -> Option<AztecAddress> {
        self.maybe_contract_address
    }
}
