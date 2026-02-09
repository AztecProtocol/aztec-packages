use crate::{
    address::{
        partial_address::PartialAddress, salted_initialization_hash::SaltedInitializationHash,
    },
    constants::{AZTEC_ADDRESS_LENGTH, DOM_SEP__CONTRACT_ADDRESS_V1, MAX_FIELD_VALUE},
    contract_class_id::ContractClassId,
    hash::poseidon2_hash_with_separator,
    public_keys::{IvpkM, NpkM, OvpkM, PublicKeys, ToPoint, TpkM},
    traits::{Deserialize, Empty, FromField, Packable, Serialize, ToField},
    utils::field::sqrt,
};

// We do below because `use crate::point::Point;` does not work
use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;

use crate::public_keys::AddressPoint;
use std::{
    embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul as derive_public_key},
    ops::Add,
};
use std::meta::derive;

// Aztec address
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct AztecAddress {
    pub inner: Field,
}

impl Empty for AztecAddress {
    fn empty() -> Self {
        Self { inner: 0 }
    }
}

impl ToField for AztecAddress {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl FromField for AztecAddress {
    fn from_field(value: Field) -> AztecAddress {
        AztecAddress { inner: value }
    }
}

impl AztecAddress {
    pub fn zero() -> Self {
        Self { inner: 0 }
    }

    /// Returns an address's `AddressPoint`, which can be used to create shared secrets with the owner
    /// of the address. If the address is invalid (i.e. it is not a properly derived Aztec address), then this
    /// returns `Option::none()`, and no shared secrets can be created.
    pub fn to_address_point(self) -> Option<AddressPoint> {
        // We compute the address point by taking our address as x, and then solving for y in the
        // equation which defines the grumpkin curve:
        // y^2 = x^3 - 17; x = address
        let x = self.inner;
        let y_squared = x * x * x - 17;

        // An invalid AztecAddress is one for which no y coordinate satisfies the curve equation, which we'll
        // identify by proving that the square root of y_squared does not exist.
        sqrt(y_squared).map(|y| {
            // If we get a negative y coordinate (y > (r - 1) / 2), we swap it to the
            // positive one (where y <= (r - 1) / 2) by negating it.
            let final_y = if Self::is_positive(y) { y } else { -y };

            AddressPoint { inner: Point { x: self.inner, y: final_y, is_infinite: false } }
        })
    }

    /// Determines whether a y-coordinate is in the lower (positive) or upper (negative) "half" of the field.
    /// I.e.
    /// y <= (r - 1)/2 => positive.
    /// y > (r - 1)/2 => negative.
    /// An AddressPoint always uses the "positive" y.
    fn is_positive(y: Field) -> bool {
        // Note: The field modulus r is MAX_FIELD_VALUE + 1.
        let MID = MAX_FIELD_VALUE / 2; // (r - 1) / 2
        let MID_PLUS_1 = MID + 1; // (r - 1)/2 + 1
        // Note: y <= m implies y < m + 1.
        y.lt(MID_PLUS_1)
    }

    pub fn compute(public_keys: PublicKeys, partial_address: PartialAddress) -> AztecAddress {
        //
        //                          address = address_point.x
        //                                          |
        //                                    address_point = pre_address * G + Ivpk_m (always choose "positive" y-coord)
        //                                                        |               ^
        //                                                        |               |.....................
        //                                                    pre_address                              .
        //                                               /                   \                         .
        //                                             /                       \                       .
        //                               partial_address                        public_keys_hash       .
        //                           /                    \                     /   /    \    \        .
        //                         /                        \              Npk_m Ivpk_m Ovpk_m Tpk_m   .
        //          contract_class_id                         \                     |...................
        //             /   |    \                               \
        // artifact_hash   |    public_bytecode_commitment       salted_initialization_hash
        //                 |                                         /     /        \
        //     private_function_tree_root              deployer_address  salt   initialization_hash
        //             /       \                                                /              \
        //          ...          ...                              constructor_fn_selector   constructor_args_hash
        //         /                \
        //     /     \            /      \
        //   leaf   leaf        leaf    leaf
        //           ^
        //           |
        //           |---h(function_selector, vk_hash)
        //               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        //               Each of these represents a private function of the contract.

        let public_keys_hash = public_keys.hash();

        let pre_address = poseidon2_hash_with_separator(
            [public_keys_hash.to_field(), partial_address.to_field()],
            DOM_SEP__CONTRACT_ADDRESS_V1,
        );

        // Note: `.add()` will fail within the blackbox fn if either of the points are not on the curve. (See tests below).
        let address_point = derive_public_key(EmbeddedCurveScalar::from_field(pre_address)).add(
            public_keys.ivpk_m.to_point(),
        );

        // Note that our address is only the x-coordinate of the full address_point. This is okay because when people want to encrypt something and send it to us
        // they can recover our full point using the x-coordinate (our address itself). To do this, they recompute the y-coordinate according to the equation y^2 = x^3 - 17.
        // When they do this, they may get a positive y-coordinate (a value that is less than or equal to MAX_FIELD_VALUE / 2) or
        // a negative y-coordinate (a value that is more than MAX_FIELD_VALUE), and we cannot dictate which one they get and hence the recovered point may sometimes be different than the one
        // our secret can decrypt. Regardless though, they should and will always encrypt using point with the positive y-coordinate by convention.
        // This ensures that everyone encrypts to the same point given an arbitrary x-coordinate (address). This is allowed because even though our original point may not have a positive y-coordinate,
        // with our original secret, we will be able to derive the secret to the point with the flipped (and now positive) y-coordinate that everyone encrypts to.
        AztecAddress::from_field(address_point.x)
    }

    pub fn compute_from_class_id(
        contract_class_id: ContractClassId,
        salted_initialization_hash: SaltedInitializationHash,
        public_keys: PublicKeys,
    ) -> Self {
        let partial_address = PartialAddress::compute_from_salted_initialization_hash(
            contract_class_id,
            salted_initialization_hash,
        );

        AztecAddress::compute(public_keys, partial_address)
    }

    pub fn is_zero(self) -> bool {
        self.inner == 0
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}

#[test]
fn check_max_field_value() {
    // Check that it is indeed r-1.
    assert_eq(MAX_FIELD_VALUE + 1, 0);
}

#[test]
fn check_is_positive() {
    assert(AztecAddress::is_positive(0));
    assert(AztecAddress::is_positive(1));
    assert(!AztecAddress::is_positive(-1));
    assert(AztecAddress::is_positive(MAX_FIELD_VALUE / 2));
    assert(!AztecAddress::is_positive((MAX_FIELD_VALUE / 2) + 1));
}

// Gives us confidence that we don't need to manually check that the input public keys need to be on the curve for `add`,
// because the blackbox function does this check for us.
#[test(should_fail_with = "is not on curve")]
fn check_embedded_curve_point_add() {
    // Choose a point not on the curve:
    let p1 = Point { x: 1, y: 1, is_infinite: false };
    let p2 = Point::generator();
    let _ = p1 + p2;
}

// Gives us confidence that we don't need to manually check that the input public keys need to be on the curve for `add`,
// because the blackbox function does this check for us.
#[test(should_fail_with = "is not on curve")]
fn check_embedded_curve_point_add_2() {
    // Choose a point not on the curve in the 2nd position.
    let p1 = Point::generator();
    let p2 = Point { x: 1, y: 1, is_infinite: false };
    let _ = p1 + p2;
}

#[test]
fn compute_address_from_partial_and_pub_keys() {
    let public_keys = PublicKeys {
        npk_m: NpkM {
            inner: Point {
                x: 0x22f7fcddfa3ce3e8f0cc8e82d7b94cdd740afa3e77f8e4a63ea78a239432dcab,
                y: 0x0471657de2b6216ade6c506d28fbc22ba8b8ed95c871ad9f3e3984e90d9723a7,
                is_infinite: false,
            },
        },
        ivpk_m: IvpkM {
            inner: Point {
                x: 0x111223493147f6785514b1c195bb37a2589f22a6596d30bb2bb145fdc9ca8f1e,
                y: 0x273bbffd678edce8fe30e0deafc4f66d58357c06fd4a820285294b9746c3be95,
                is_infinite: false,
            },
        },
        ovpk_m: OvpkM {
            inner: Point {
                x: 0x09115c96e962322ffed6522f57194627136b8d03ac7469109707f5e44190c484,
                y: 0x0c49773308a13d740a7f0d4f0e6163b02c5a408b6f965856b6a491002d073d5b,
                is_infinite: false,
            },
        },
        tpk_m: TpkM {
            inner: Point {
                x: 0x00d3d81beb009873eb7116327cf47c612d5758ef083d4fda78e9b63980b2a762,
                y: 0x2f567d22d2b02fe1f4ad42db9d58a36afd1983e7e2909d1cab61cafedad6193a,
                is_infinite: false,
            },
        },
    };

    let partial_address = PartialAddress::from_field(
        0x0a7c585381b10f4666044266a02405bf6e01fa564c8517d4ad5823493abd31de,
    );

    let address = AztecAddress::compute(public_keys, partial_address);

    // The following value was generated by `derivation.test.ts`.
    // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
    let expected_computed_address_from_partial_and_pubkeys =
        0x2f66081d4bb077fbe8e8abe96a3516a713a3d7e34360b4e985da0da95092b37d;
    assert(address.to_field() == expected_computed_address_from_partial_and_pubkeys);
}

#[test]
fn compute_preaddress_from_partial_and_pub_keys() {
    let pre_address = poseidon2_hash_with_separator([1, 2], DOM_SEP__CONTRACT_ADDRESS_V1);
    let expected_computed_preaddress_from_partial_and_pubkey =
        0x286c7755f2924b1e53b00bcaf1adaffe7287bd74bba7a02f4ab867e3892d28da;
    assert(pre_address == expected_computed_preaddress_from_partial_and_pubkey);
}

#[test]
fn from_field_to_field() {
    let address = AztecAddress { inner: 37 };
    assert_eq(FromField::from_field(address.to_field()), address);
}

#[test]
fn serde() {
    let address = AztecAddress { inner: 37 };
    // We use the AZTEC_ADDRESS_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; AZTEC_ADDRESS_LENGTH] = address.serialize();
    let deserialized = AztecAddress::deserialize(serialized);
    assert_eq(address, deserialized);
}

#[test]
fn to_address_point_valid() {
    // x = 8 where x^3 - 17 = 512 - 17 = 495, which is a residue in this field
    let address = AztecAddress { inner: 8 };
    let maybe_point = address.to_address_point();
    assert(maybe_point.is_some());

    let point = maybe_point.unwrap().inner;
    // check that x is preserved
    assert_eq(point.x, Field::from(8));

    // check that the curve equation holds: y^2 == x^3 - 17
    assert_eq(point.y * point.y, point.x * point.x * point.x - 17);
}

#[test]
unconstrained fn to_address_point_invalid() {
    // x = 3 where x^3 - 17 = 27 - 17 = 10, which is a non-residue in this field
    let address = AztecAddress { inner: 3 }; //
    let maybe_point = address.to_address_point();
    assert(maybe_point.is_none());
}
