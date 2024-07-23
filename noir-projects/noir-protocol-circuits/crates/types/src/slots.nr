use crate::{generators::G_slot, point::Point, scalar::Scalar, traits::ToField};
use dep::std::{embedded_curve_ops::multi_scalar_mul, field::bn254::decompose};

global S1 = Point { x: 0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15, y: 0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791, is_infinite: false };
global S2 = Point { x: 0x047df3ac2425b3359b582a5fd340168c9dca8a0c0ef63af0ba97d2d3b3adda52, y: 0x23c4574a895a4ef693c02df3411bca997185cd677ae4af6f6b4a313a14c943a3, is_infinite: false };
global S3 = Point { x: 0x224de6d3e4c26e053b190add588b5800bc5063bd702caa096602af74fac60f04, y: 0x0d64bbdb6d5e279cb6a056d24b5c2fc0cec91c11ce7034406f5181af13149245, is_infinite: false };
global INITIALIZATION_SLOT_SEPARATOR_SLOT = Point { x: 0x2843aa78bf6b692ba8ed31629ad92e52770ead9d08fbfab5d9a1f1ed873ec5f6, y: 0x2532556fce143eafe6fdcb229d49a86a83b3f91e1b56d6c3d8520cf8c06776dc, is_infinite: false };

// Derive a base slot (using the base generator) from a slot preimage
// TODO(#7551): review all the usage of this function and ensure that the correct generator is used!
pub fn derive_base_slot(slot_preimage: Field) -> Point {
    // We check that the slot preimage fits into 128 bits --> this is ok for base slots
    slot_preimage.assert_max_bit_size(128);
    multi_scalar_mul([G_slot], [Scalar { lo: slot_preimage, hi: 0 }])
}

pub fn derive_storage_slot_in_map<K>(map_storage_slot: Point, key: K) -> Point where K: ToField {
    // TODO(#7551): isn't decomposing terribly expensive here? --> we should probably optimize this as this will be
    // all over the place now
    let (key_lo, key_hi) = decompose(key.to_field());

    // TODO(#7551): we will need to use different slots for key and map slot here!
    multi_scalar_mul([G_slot], [Scalar { lo: key_lo, hi: key_hi }]) + map_storage_slot
}

// TODO(#7551): nuke this func - is only temporarily used in note_interface.rs before we get some AVM compatible
// hash func hashing to a point
pub fn derive_base_slot_with_decompose(slot_preimage: Field) -> Point {
    let (lo, hi) = dep::std::field::bn254::decompose(slot_preimage);
    multi_scalar_mul([G_slot], [Scalar { lo, hi }])
}

mod test {
    use crate::{
        constants::INITIALIZATION_SLOT_SEPARATOR, generators::G_slot, point::Point,
        slots::{derive_base_slot, S1, S2, S3, INITIALIZATION_SLOT_SEPARATOR_SLOT}
    };

    #[test]
    fn test_derive_base_slot() {
        let derived_s1 = derive_base_slot(1);
        let derived_s2 = derive_base_slot(2);
        let derived_s3 = derive_base_slot(3);
        let derived_slot_separator_slot = derive_base_slot(INITIALIZATION_SLOT_SEPARATOR);
        assert_eq(derived_s1, S1);
        assert_eq(derived_s2, S2);
        assert_eq(derived_s3, S3);
        assert_eq(derived_slot_separator_slot, INITIALIZATION_SLOT_SEPARATOR_SLOT);
    }
}
