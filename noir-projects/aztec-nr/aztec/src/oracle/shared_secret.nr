use crate::ephemeral::EphemeralArray;
use crate::protocol::{address::AztecAddress, hash::sha256_to_field, point::EmbeddedCurvePoint};

global GET_SHARED_SECRET_SINGLE_SLOT: Field = sha256_to_field("AZTEC_NR::GET_SHARED_SECRET_SINGLE_SLOT".as_bytes());

#[oracle(aztec_utl_getSharedSecrets)]
unconstrained fn get_shared_secrets_oracle(
    address: AztecAddress,
    eph_pks: EphemeralArray<EmbeddedCurvePoint>,
    contract_address: AztecAddress,
) -> EphemeralArray<Field> {}

/// Convenience wrapper around [`get_shared_secrets`] for a single ephemeral public key.
pub unconstrained fn get_shared_secret(
    address: AztecAddress,
    eph_pk: EmbeddedCurvePoint,
    contract_address: AztecAddress,
) -> Field {
    let eph_pks: EphemeralArray<EmbeddedCurvePoint> = EphemeralArray::empty_at(GET_SHARED_SECRET_SINGLE_SLOT);
    eph_pks.push(eph_pk);
    let secrets = get_shared_secrets(address, eph_pks, contract_address);
    secrets.get(0)
}

/// Returns app-siloed shared secrets between `address` and someone who knows the secret keys behind the given
/// ephemeral public keys.
///
/// Each returned Field `s_app` is computed as:
///
/// ```text
/// S     = address_secret * ephPk          (raw ECDH point)
/// s_app = h(DOM_SEP, S.x, S.y, contract)  (app-siloed scalar)
/// ```
///
/// where `contract` is the address of the calling contract. The oracle host validates this matches its execution
/// context.
///
/// Without app-siloing, a malicious contract could call this oracle with public information (address, ephPk) and
/// obtain the same raw secret as the legitimate contract, enabling cross-contract decryption. By including the
/// contract address in the hash, each contract receives a different `s_app`, preventing this attack.
///
/// Callers derive indexed subkeys from `s_app` via
/// [`derive_shared_secret_subkey`](crate::keys::ecdh_shared_secret::derive_shared_secret_subkey).
pub unconstrained fn get_shared_secrets(
    address: AztecAddress,
    eph_pks: EphemeralArray<EmbeddedCurvePoint>,
    contract_address: AztecAddress,
) -> EphemeralArray<Field> {
    let response = get_shared_secrets_oracle(address, eph_pks, contract_address);
    assert(response.len() == eph_pks.len(), "get_shared_secrets: response length does not match request length");
    response
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::oracle::shared_secret::get_shared_secrets;
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::utils::point::point_from_x_coord;
    use std::test::OracleMock;

    #[test]
    unconstrained fn preserves_ephemeral_key_ordering() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let _ = mock_get_shared_secrets([100, 200, 300]);

            let pk_a = point_from_x_coord(1).unwrap();
            let pk_b = point_from_x_coord(2).unwrap();
            let pk_c = point_from_x_coord(8).unwrap();

            let eph_pks: EphemeralArray<_> = EphemeralArray::empty_at(200);
            eph_pks.push(pk_a);
            eph_pks.push(pk_b);
            eph_pks.push(pk_c);

            let _: EphemeralArray<Field> = get_shared_secrets(
                AztecAddress::from_field(1),
                eph_pks,
                AztecAddress::from_field(2),
            );

            assert_eq(eph_pks.get(0), pk_a);
            assert_eq(eph_pks.get(1), pk_b);
            assert_eq(eph_pks.get(2), pk_c);
        });
    }

    #[test]
    unconstrained fn returns_secrets_in_order() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let _ = mock_get_shared_secrets([111, 222, 333]);

            let pk = point_from_x_coord(1).unwrap();
            let eph_pks: EphemeralArray<_> = EphemeralArray::empty_at(200);
            eph_pks.push(pk);
            eph_pks.push(pk);
            eph_pks.push(pk);

            let results: EphemeralArray<Field> = get_shared_secrets(
                AztecAddress::from_field(1),
                eph_pks,
                AztecAddress::from_field(2),
            );

            assert_eq(results.get(0), 111);
            assert_eq(results.get(1), 222);
            assert_eq(results.get(2), 333);
        });
    }

    #[test(should_fail_with = "response length does not match request length")]
    unconstrained fn cannot_return_mismatched_length() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let _ = mock_get_shared_secrets([111, 222]);

            let pk = point_from_x_coord(1).unwrap();
            let eph_pks: EphemeralArray<_> = EphemeralArray::empty_at(200);
            eph_pks.push(pk);

            let _: EphemeralArray<Field> = get_shared_secrets(
                AztecAddress::from_field(1),
                eph_pks,
                AztecAddress::from_field(2),
            );
        });
    }

    unconstrained fn mock_get_shared_secrets<let N: u32>(response_values: [Field; N]) -> Field {
        let response_slot: Field = 99;
        let response_array: EphemeralArray<Field> = EphemeralArray::at(response_slot);
        for value in response_values {
            response_array.push(value);
        }
        let _ = OracleMock::mock("aztec_utl_getSharedSecrets").returns(response_slot);
        response_slot
    }
}
