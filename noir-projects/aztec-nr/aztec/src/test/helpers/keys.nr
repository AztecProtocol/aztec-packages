use dep::protocol_types::{
    address::AztecAddress, storage::map::derive_storage_slot_in_map,
    constants::CANONICAL_KEY_REGISTRY_ADDRESS, point::Point
};

use crate::{generators::G_slot, test::helpers::cheatcodes};

pub fn store_master_key(key_index: Field, address: AztecAddress, key: Point) {
    let x_coordinate_map_slot_preimage = key_index * 2 + 1;
    let y_coordinate_map_slot_preimage = x_coordinate_map_slot_preimage + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot_preimage, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot_preimage, address);

    let canonical_registry_address = AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS);

    cheatcodes::direct_storage_write(canonical_registry_address, x_coordinate_derived_slot, [key.x]);
    cheatcodes::direct_storage_write(canonical_registry_address, y_coordinate_derived_slot, [key.y]);
}
