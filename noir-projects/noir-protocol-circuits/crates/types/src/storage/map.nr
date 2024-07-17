use crate::{hash::pedersen_hash, point::Point, traits::ToField};

// TODO(benesjan): what storage slot generator to use here?
global G_slot = Point { x: 0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15, y: 0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791, is_infinite: false };

pub fn derive_storage_slot_in_map<K>(storage_slot: Point, key: K) -> Field where K: ToField {
    pedersen_hash([storage_slot, key.to_field()], 0)
}
