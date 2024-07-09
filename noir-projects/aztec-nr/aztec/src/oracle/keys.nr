use crate::keys::PublicKeys;
use dep::protocol_types::{address::{AztecAddress, PartialAddress}, embedded_curve_point::EmbeddedCurvePoint};

#[oracle(getPublicKeysAndPartialAddress)]
unconstrained fn get_public_keys_and_partial_address_oracle(_address: AztecAddress) -> [Field; 13] {}

unconstrained fn get_public_keys_and_partial_address_oracle_wrapper(address: AztecAddress) -> [Field; 13] {
    get_public_keys_and_partial_address_oracle(address)
}

fn get_public_keys_and_partial_address(address: AztecAddress) -> (PublicKeys, PartialAddress) {
    let result = get_public_keys_and_partial_address_oracle_wrapper(address);

    let keys = PublicKeys {
        npk_m: EmbeddedCurvePoint::new(result[0], result[1], result[2] as bool),
        ivpk_m: EmbeddedCurvePoint::new(result[3], result[4], result[5] as bool),
        ovpk_m: EmbeddedCurvePoint::new(result[6], result[7], result[8] as bool),
        tpk_m: EmbeddedCurvePoint::new(result[9], result[10], result[11] as bool)
    };

    let partial_address = PartialAddress::from_field(result[12]);

    (keys, partial_address)
}
