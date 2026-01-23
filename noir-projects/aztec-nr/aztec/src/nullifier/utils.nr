use crate::{context::NullifierExistenceRequest, oracle::nullifiers::is_nullifier_pending};

use protocol_types::{address::aztec_address::AztecAddress, hash::compute_siloed_nullifier};

/// Returns the [NullifierExistenceRequest] used to prove a nullifier exists.
pub fn compute_nullifier_existence_request(
    unsiloed_nullifier: Field,
    contract_address: AztecAddress,
) -> NullifierExistenceRequest {
    let pending_read_request =
        NullifierExistenceRequest::for_pending(unsiloed_nullifier, contract_address);

    let siloed_nullifier = compute_siloed_nullifier(contract_address, unsiloed_nullifier);
    let settled_read_request = NullifierExistenceRequest::for_settled(siloed_nullifier);

    // Safety: This is a hint to check whether we are reading a pending or settled nullifier. The chosen read request
    // will be validated by the kernel. Failure to provide a correct hint will cause the read request validation to fail.
    let should_use_pending_read_request =
        unsafe { is_nullifier_pending(unsiloed_nullifier, contract_address) };

    if should_use_pending_read_request {
        pending_read_request
    } else {
        settled_read_request
    }
}
