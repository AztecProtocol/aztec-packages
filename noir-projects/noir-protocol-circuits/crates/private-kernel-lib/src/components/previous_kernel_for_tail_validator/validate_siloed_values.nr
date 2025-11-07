use types::{address::AztecAddress, side_effect::Scoped, utils::arrays::ClaimedLengthArray};

/// Ensure that the data has been properly siloed in the reset circuit.
/// Since the siloing is always performed from index 0, we only need to check the last item (within the claimed length).
/// If the last item is siloed, then the entire array is siloed.
/// A siloed item has a zero contract address, and unsiloed item must not have a zero contract address.
/// See `reset_output_validator.nr` for how siloing is performed.
pub fn validate_siloed_values<T, let N: u32, let S: u32>(
    array: ClaimedLengthArray<Scoped<T>, N>,
    name: str<S>,
) {
    let num_items = array.length;
    if num_items != 0 {
        let item = array.array[num_items - 1];
        assert_eq(
            item.contract_address,
            AztecAddress::zero(),
            f"{name} have not been siloed in a reset",
        );
    }
}
