use crate::{hash::pedersen_hash, point::Point, scalar::Scalar, traits::ToField};
use dep::std::field::bn254::decompose;
use dep::std::embedded_curve_ops::multi_scalar_mul;

// TODO(benesjan): what storage slot generator to use here?
global G_slot = Point { x: 0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15, y: 0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791, is_infinite: false };

pub fn derive_storage_slot_in_map<K>(map_storage_slot_preimage: Field, key: K) -> Field where K: ToField {

    // TODO(benesjan): isn't decomposing terribly expensive here? --> we should probably optimize this as this will be
    // all over the place now
    let (preimage_lo, preimage_hi) = decompose(map_storage_slot_preimage.to_field());
    let (key_lo, key_hi) = decompose(key.to_field());

    // TODO(benesjan): we will need to use different slots for key and map slot here!
    multi_scalar_mul([G_slot, G_slot], [Scalar { lo: preimage_lo, hi: preimage_hi }, Scalar { lo: key_lo, hi: key_hi }])
}
