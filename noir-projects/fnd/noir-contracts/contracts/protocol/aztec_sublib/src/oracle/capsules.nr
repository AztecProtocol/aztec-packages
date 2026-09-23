use crate::protocol::{address::AztecAddress, traits::Deserialize};

/// Returns data previously stored in the per-contract non-volatile database. Returns Option::none() if nothing was
/// stored at the given slot.
pub unconstrained fn load<T>(contract_address: AztecAddress, slot: Field, scope: AztecAddress) -> Option<T>
where
    T: Deserialize,
{
    let serialized_option = load_oracle(contract_address, slot, <T as Deserialize>::N, scope);
    serialized_option.map(|arr| Deserialize::deserialize(arr))
}

/// We need to pass in `array_len` (the value of N) as a parameter to tell the oracle how many fields the response must
/// have.
///
/// Note that the oracle returns an Option<[Field; N]> because we cannot return an Option<T> directly. That would
/// require for the oracle resolver to know the shape of T (e.g. if T were a struct of 3 u32 values then the expected
/// response shape would be 3 single items, whereas it were a struct containing `u32, [Field;10], u32` then the
/// expected shape would be single, array, single.). Instead, we return the serialization and deserialize in Noir.
// TODO(F-498): review naming consistency
#[oracle(aztec_protocol_utl_getCapsule)]
unconstrained fn load_oracle<let N: u32>(
    contract_address: AztecAddress,
    slot: Field,
    array_len: u32,
    scope: AztecAddress,
) -> Option<[Field; N]> {}
