use dep::types::{
    abis::{public_data_update_request::PublicDataUpdateRequest, public_data_write::OverridablePublicDataWrite},
    utils::arrays::array_merge
};

unconstrained pub fn generate_combined_overridable_public_data_writes<let N: u32>(
    non_revertible: [PublicDataUpdateRequest; N],
    revertible: [PublicDataUpdateRequest; N]
) -> [OverridablePublicDataWrite; N] {
    let mut overridable_public_data_writes = array_merge(non_revertible, revertible).map(|write| OverridablePublicDataWrite { write, override_counter: 0 });

    for i in 0..overridable_public_data_writes.len() {
        let write = overridable_public_data_writes[i].write;
        if write.counter != 0 {
            let mut override_counter = 0;
            for j in 0..overridable_public_data_writes.len() {
                let other = overridable_public_data_writes[j].write;
                if (other.leaf_slot == write.leaf_slot)
                    & (other.counter > write.counter)
                    & ((override_counter == 0) | (other.counter < override_counter)) {
                    override_counter = other.counter;
                }
            }
            overridable_public_data_writes[i].override_counter = override_counter;
        }
    }

    overridable_public_data_writes
}
