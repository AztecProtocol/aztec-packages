use crate::messages::delivery::OnchainDeliveryMode;
use crate::protocol::point::EmbeddedCurvePoint;
use crate::protocol::traits::{Deserialize, Serialize};

use crate::{
    ephemeral::EphemeralArray,
    messages::processing::provided_secret::ProvidedSecret,
    oracle::{call_utility_function::call_utility_function, shared_secret::get_shared_secrets},
    protocol::{
        abis::function_selector::FunctionSelector, address::AztecAddress, hash::sha256_to_field, traits::ToField,
    },
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
};

/// Page size for handshake discovery pagination.
pub global MAX_HANDSHAKES_PER_PAGE: u32 = 32;

/// A handshake discovered during sync: the sender's ephemeral public key and the delivery mode.
#[derive(Deserialize, Eq, Serialize)]
pub struct DiscoveredHandshake {
    pub eph_pk: EmbeddedCurvePoint,
    pub mode: OnchainDeliveryMode,
}

/// A paginated response of discovered handshakes.
#[derive(Deserialize, Serialize)]
pub struct HandshakePage {
    pub items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE>,
    pub total_count: u32,
}

pub(crate) global PROVIDED_SECRETS_ARRAY_BASE_SLOT: Field =
    sha256_to_field("AZTEC_NR::PROVIDED_SECRETS_ARRAY_BASE_SLOT".as_bytes());

global HANDSHAKE_EPH_PKS_SLOT: Field = sha256_to_field("AZTEC_NR::HANDSHAKE_EPH_PKS_SLOT".as_bytes());

global HANDSHAKE_MODES_SLOT: Field = sha256_to_field("AZTEC_NR::HANDSHAKE_MODES_SLOT".as_bytes());

/// Fetches discovered handshakes from the HandshakeRegistry and derives app-siloed tagging secrets for each,
/// returning them so that [`get_pending_tagged_logs`](crate::oracle::message_processing::get_pending_tagged_logs)
/// searches for logs tagged with these secrets.
pub(crate) unconstrained fn get_handshake_secrets(
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> EphemeralArray<ProvidedSecret> {
    let provided_secrets = EphemeralArray::<ProvidedSecret>::empty_at(PROVIDED_SECRETS_ARRAY_BASE_SLOT);

    let eph_pks: EphemeralArray<EmbeddedCurvePoint> = EphemeralArray::empty_at(HANDSHAKE_EPH_PKS_SLOT);
    let modes: EphemeralArray<OnchainDeliveryMode> = EphemeralArray::empty_at(HANDSHAKE_MODES_SLOT);

    let mut page_offset: u32 = 0;
    let mut has_more = true;
    while has_more {
        let page = fetch_handshake_page(scope, page_offset);

        for j in 0..page.items.len() {
            let handshake = page.items.get(j);
            eph_pks.push(handshake.eph_pk);
            modes.push(handshake.mode);
        }

        page_offset += page.items.len();
        has_more = page_offset < page.total_count;
    }

    if eph_pks.len() > 0 {
        let secrets = get_shared_secrets(scope, eph_pks, contract_address);
        for j in 0..secrets.len() {
            provided_secrets.push(ProvidedSecret { secret: secrets.get(j), mode: modes.get(j) });
        }
    }

    provided_secrets
}

/// Calls the HandshakeRegistry's `get_handshakes` utility function and deserializes the response.
unconstrained fn fetch_handshake_page(recipient: AztecAddress, page_offset: u32) -> HandshakePage {
    let selector = comptime { FunctionSelector::from_signature("get_handshakes((Field),u32)") };
    let args: [Field; 2] = [recipient.to_field(), page_offset as Field];
    let response = call_utility_function(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, selector, args);
    HandshakePage::deserialize(response)
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::messages::delivery::handshake::{
        DiscoveredHandshake, get_handshake_secrets, HandshakePage, MAX_HANDSHAKES_PER_PAGE,
    };
    use crate::messages::delivery::OnchainDeliveryMode;
    use crate::protocol::{address::AztecAddress, traits::Serialize};
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::utils::point::point_from_x_coord;
    use std::test::OracleMock;

    global UNCONSTRAINED: OnchainDeliveryMode = OnchainDeliveryMode::onchain_unconstrained();
    global CONSTRAINED: OnchainDeliveryMode = OnchainDeliveryMode::onchain_constrained();

    #[test]
    unconstrained fn get_handshake_secrets_returns_secrets_from_single_page() {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let pk_a = point_from_x_coord(1).unwrap();
            let pk_b = point_from_x_coord(2).unwrap();

            let mut items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            items.push(DiscoveredHandshake { eph_pk: pk_a, mode: UNCONSTRAINED });
            items.push(DiscoveredHandshake { eph_pk: pk_b, mode: CONSTRAINED });
            let page = HandshakePage { items, total_count: 2 };
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page.serialize());

            let secret_a: Field = 111;
            let secret_b: Field = 222;
            mock_get_shared_secrets([secret_a, secret_b]);

            let secrets = get_handshake_secrets(contract_address, scope);

            assert_eq(secrets.len(), 2);
            assert_eq(secrets.get(0).secret, secret_a);
            assert_eq(secrets.get(0).mode, UNCONSTRAINED);
            assert_eq(secrets.get(1).secret, secret_b);
            assert_eq(secrets.get(1).mode, CONSTRAINED);
        });
    }

    #[test]
    unconstrained fn get_handshake_secrets_fetches_multiple_pages() {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let pk_a = point_from_x_coord(1).unwrap();
            let pk_b = point_from_x_coord(2).unwrap();
            let pk_c = point_from_x_coord(8).unwrap();

            let mut page_1_items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            page_1_items.push(DiscoveredHandshake { eph_pk: pk_a, mode: UNCONSTRAINED });
            page_1_items.push(DiscoveredHandshake { eph_pk: pk_b, mode: CONSTRAINED });
            let page_1 = HandshakePage { items: page_1_items, total_count: 3 };

            let mut page_2_items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            page_2_items.push(DiscoveredHandshake { eph_pk: pk_c, mode: UNCONSTRAINED });
            let page_2 = HandshakePage { items: page_2_items, total_count: 3 };

            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page_1.serialize()).times(1);
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page_2.serialize()).times(1);

            mock_get_shared_secrets([111, 222, 333]);

            let secrets = get_handshake_secrets(contract_address, scope);
            assert_eq(secrets.len(), 3);
            assert_eq(secrets.get(0).secret, 111);
            assert_eq(secrets.get(0).mode, UNCONSTRAINED);
            assert_eq(secrets.get(1).secret, 222);
            assert_eq(secrets.get(1).mode, CONSTRAINED);
            assert_eq(secrets.get(2).secret, 333);
            assert_eq(secrets.get(2).mode, UNCONSTRAINED);
        });
    }

    unconstrained fn mock_get_shared_secrets<let N: u32>(response_values: [Field; N]) {
        let response_slot: Field = 99;
        let response_array: EphemeralArray<Field> = EphemeralArray::at(response_slot);
        for value in response_values {
            response_array.push(value);
        }
        let _ = OracleMock::mock("aztec_utl_getSharedSecrets").returns(response_slot);
    }
}
