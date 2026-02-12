use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `load`. If
/// data was already stored at this slot, it is overwritten.
pub unconstrained fn store<T>(contract_address: AztecAddress, slot: Field, value: T)
where
    T: Serialize,
{
    let serialized = value.serialize();
    store_oracle(contract_address, slot, serialized);
}

/// Returns data previously stored via `storeCapsule` in the per-contract non-volatile database. Returns Option::none()
/// if nothing was stored at the given slot.
pub unconstrained fn load<T>(contract_address: AztecAddress, slot: Field) -> Option<T>
where
    T: Deserialize,
{
    let serialized_option = load_oracle(contract_address, slot, <T as Deserialize>::N);
    serialized_option.map(|arr| Deserialize::deserialize(arr))
}

/// Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
pub unconstrained fn delete(contract_address: AztecAddress, slot: Field) {
    delete_oracle(contract_address, slot);
}

/// Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data
/// structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`. Supports overlapping source and
/// destination regions (which will result in the overlapped source values being overwritten). All copied slots must
/// exist in the database (i.e. have been stored and not deleted)
pub unconstrained fn copy(
    contract_address: AztecAddress,
    src_slot: Field,
    dst_slot: Field,
    num_entries: u32,
) {
    copy_oracle(contract_address, src_slot, dst_slot, num_entries);
}

#[oracle(utilityStoreCapsule)]
unconstrained fn store_oracle<let N: u32>(
    contract_address: AztecAddress,
    slot: Field,
    values: [Field; N],
) {}

/// We need to pass in `array_len` (the value of N) as a parameter to tell the oracle how many fields the response must
/// have.
///
/// Note that the oracle returns an Option<[Field; N]> because we cannot return an Option<T> directly. That would
/// require for the oracle resolver to know the shape of T (e.g. if T were a struct of 3 u32 values then the expected
/// response shape would be 3 single items, whereas it were a struct containing `u32, [Field;10], u32` then the
/// expected shape would be single, array, single.). Instead, we return the serialization and deserialize in Noir.
#[oracle(utilityLoadCapsule)]
unconstrained fn load_oracle<let N: u32>(
    contract_address: AztecAddress,
    slot: Field,
    array_len: u32,
) -> Option<[Field; N]> {}

#[oracle(utilityDeleteCapsule)]
unconstrained fn delete_oracle(contract_address: AztecAddress, slot: Field) {}

#[oracle(utilityCopyCapsule)]
unconstrained fn copy_oracle(
    contract_address: AztecAddress,
    src_slot: Field,
    dst_slot: Field,
    num_entries: u32,
) {}
