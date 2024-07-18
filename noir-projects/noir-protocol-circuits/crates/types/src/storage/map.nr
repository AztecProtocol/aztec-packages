use crate::{hash::pedersen_hash, point::Point, scalar::Scalar, traits::ToField};
use dep::std::field::bn254::decompose;
use dep::std::embedded_curve_ops::multi_scalar_mul;

// TODO(benesjan): what storage slot generator to use here?
global G_slot = Point { x: 0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15, y: 0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791, is_infinite: false };

pub fn derive_storage_slot_in_map<K>(map_storage_slot: Point, key: K) -> Field where K: ToField {
    // TODO(benesjan): isn't decomposing terribly expensive here?
    let (key_lo, key_hi) = decompose(key.to_field());

    multi_scalar_mul([G_slot], [Scalar { lo: key_lo, hi: key_hi }]) + map_storage_slot
}
