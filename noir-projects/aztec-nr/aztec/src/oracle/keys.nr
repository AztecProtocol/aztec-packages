use dep::protocol_types::{
    address::{AztecAddress, PartialAddress},
    point::Point,
    public_keys::{IvpkM, NpkM, OvpkM, PublicKeys, TpkM},
};

#[oracle(getPublicKeysAndPartialAddress)]
unconstrained fn get_public_keys_and_partial_address_oracle(_address: AztecAddress) -> [Field; 13] {}

pub unconstrained fn get_public_keys_and_partial_address(
    address: AztecAddress,
) -> (PublicKeys, PartialAddress) {
    let result = get_public_keys_and_partial_address_oracle(address);

    let keys = PublicKeys {
        npk_m: NpkM { inner: Point { x: result[0], y: result[1], is_infinite: result[2] != 0 } },
        ivpk_m: IvpkM { inner: Point { x: result[3], y: result[4], is_infinite: result[5] != 0 } },
        ovpk_m: OvpkM { inner: Point { x: result[6], y: result[7], is_infinite: result[8] != 0 } },
        tpk_m: TpkM { inner: Point { x: result[9], y: result[10], is_infinite: result[11] != 0 } },
    };

    let partial_address = PartialAddress::from_field(result[12]);

    (keys, partial_address)
}
