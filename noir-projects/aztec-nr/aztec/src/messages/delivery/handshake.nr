use crate::protocol::point::EmbeddedCurvePoint;
use crate::protocol::traits::{Deserialize, Serialize};
use std::embedded_curve_ops::{EmbeddedCurveScalar, multi_scalar_mul};

use crate::{
    context::PrivateContext,
    ephemeral::EphemeralArray,
    messages::{delivery::OnchainDeliveryMode, processing::provided_secret::ProvidedSecret},
    oracle::{call_utility_function::call_utility_function, shared_secret::get_shared_secrets},
    protocol::{
        abis::function_selector::FunctionSelector,
        address::AztecAddress,
        constants::DOM_SEP__HANDSHAKE_FORGERY_PROTECTION,
        hash::{poseidon2_hash_with_separator, sha256_to_field},
        traits::ToField,
    },
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
};

/// Page size for handshake discovery pagination.
pub global MAX_HANDSHAKES_PER_PAGE: u32 = 32;

/// A handshake discovered during sync: the sender's ephemeral public key.
#[derive(Deserialize, Eq, Serialize)]
pub struct DiscoveredHandshake {
    pub eph_pk: EmbeddedCurvePoint,
}

/// A paginated response of discovered handshakes.
#[derive(Deserialize, Serialize)]
pub struct HandshakePage {
    pub items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE>,
    pub total_count: u32,
}

/// The app-siloed handshake secrets the registry returns for a `(sender, recipient)` pair.
#[derive(Deserialize, Eq, Serialize)]
pub struct AppSiloedHandshakeSecrets {
    /// The app-siloed shared secret, used to derive the recipient's discovery tag. The recipient can reconstruct
    /// it from the handshake's public ephemeral key via ECDH.
    pub shared: Field,
    /// The app-siloed sender-only secret, folded into the constrained-delivery sequence nullifier so only the
    /// sender can advance a sequence. The recipient cannot reconstruct it: it derives from a random secret stored
    /// only in the sender's handshake note and never transmitted.
    pub sender_only: Field,
}

pub(crate) global PROVIDED_SECRETS_ARRAY_BASE_SLOT: Field =
    sha256_to_field("AZTEC_NR::PROVIDED_SECRETS_ARRAY_BASE_SLOT".as_bytes());

global HANDSHAKE_EPH_PKS_SLOT: Field = sha256_to_field("AZTEC_NR::HANDSHAKE_EPH_PKS_SLOT".as_bytes());

// The helper cannot import the handshake registry interface because the registry contract depends on aztec-nr. These
// selector constants pin the registry ABI surface this library calls. The registry's test suite compares them against
// its macro-generated `HandshakeRegistry::at(...).method(...).selector` values so signature drift fails in tests.
pub global GET_APP_SILOED_SECRETS_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("get_app_siloed_secrets((Field),(Field))") };
pub global NON_INTERACTIVE_HANDSHAKE_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("non_interactive_handshake((Field),(Field))") };
pub global INTERACTIVE_HANDSHAKE_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("interactive_handshake((Field),(Field))") };
pub global GET_NON_INTERACTIVE_HANDSHAKES_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("get_non_interactive_handshakes((Field),u32)") };

/// Protects a handshake's shared secret from recipient forgery.
///
/// The handshake's ECDH shared secret is symmetric: `S = eph_sk * recipient_pub`, where `(eph_sk, eph_pk)` is
/// the sender's ephemeral key pair, also equals `recipient_priv * eph_pk`. The recipient recomputing `S` this
/// way is normal: it is how they derive the handshake's tags when scanning. The attack is minting a second
/// handshake with the same secret: the ephemeral key is unconstrained, so a malicious recipient can register
/// its own handshake crafted to land on `S` again, with a different sender-only secret, and emit logs under
/// the honest handshake's constrained-delivery tag. That breaks the invariant that a constrained-delivery log
/// sequence is tied to a single sender: by colliding on the tag it blocks the honest sender, who can no longer
/// emit the next note in their sequence.
///
/// The protection multiplies `S` by the scalar `k = hash(eph_pk, recipient_point)`: a forgery must announce a
/// different `eph_pk`, so the protected secrets diverge. The result is still a point and silos like `S`.
///
/// The recipient point must be part of `k`: were `k` independent of it, an attacker choosing the fake
/// recipient point as a multiple of the honest protected secret could solve for the multiplier that makes the
/// forged secret land exactly on it.
///
/// Concretely, on the sender's side:
///   S  = eph_sk * recipient_point
///   S' = protect_from_forgery(S, eph_pk, recipient_point) = k * S
///
/// See [`forgery_protected_eph_pk`] for how that arrives at the same `S'`.
pub fn protect_from_forgery(
    secret: EmbeddedCurvePoint,
    eph_pk: EmbeddedCurvePoint,
    recipient_point: EmbeddedCurvePoint,
) -> EmbeddedCurvePoint {
    let scalar = poseidon2_hash_with_separator(
        [eph_pk.x, eph_pk.y, recipient_point.x, recipient_point.y],
        DOM_SEP__HANDSHAKE_FORGERY_PROTECTION,
    );
    multi_scalar_mul([secret], [EmbeddedCurveScalar::from_field(scalar)])
}

/// Applies the forgery protection to a discovered ephemeral key.
///
/// The recipient never holds the raw `S` (its side of the ECDH happens inside PXE), so it cannot call
/// [`protect_from_forgery`] on the secret directly. The protection is a scalar multiplication and therefore
/// commutes through ECDH: protecting the ephemeral key before the shared-secret derivation yields the same
/// protected secret `S'` the sender stored:
///
///   protected_eph_pk = forgery_protected_eph_pk(eph_pk, recipient_point) = k * eph_pk
///   recipient_priv * protected_eph_pk = recipient_priv * (k * eph_pk) = k * (recipient_priv * eph_pk) = k * S = S'
pub fn forgery_protected_eph_pk(eph_pk: EmbeddedCurvePoint, recipient_point: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    // Passing `eph_pk` twice is deliberate: it is both the point being multiplied and an input to the scalar
    // `k`, yielding `k * eph_pk` (see the algebra on [`protect_from_forgery`]).
    protect_from_forgery(eph_pk, eph_pk, recipient_point)
}

/// Reads the existing app-siloed handshake secrets for `(sender, recipient)` from the registry.
///
/// Returns `None` when no handshake has been registered for the pair yet, in which case the caller decides how to
/// source a tagging secret (see [`super::tag::derive_log_tag`]).
///
/// ## Batching
///
/// This reads committed state, so within a single transaction multiple sends cannot see each other's pending
/// handshake. A brand-new recipient therefore needs one landed transaction to establish the handshake before further
/// sends can be batched onto it.
pub(crate) unconstrained fn get_existing_app_siloed_handshake_secrets(
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Option<AppSiloedHandshakeSecrets> {
    let returns = call_utility_function(
        registry,
        GET_APP_SILOED_SECRETS_SELECTOR,
        [sender.to_field(), recipient.to_field()],
    );
    Deserialize::deserialize(returns)
}

/// Establishes a non-interactive handshake for `(sender, recipient)` and returns its app-siloed secrets.
///
/// The registry inserts a fresh handshake note and returns the app-siloed secrets. The constrained return value is the
/// source of truth for the secrets, so constrained delivery anchoring a freshly bootstrapped handshake needs no
/// separate call to the registry's `validate_handshake`.
///
/// Any handshake already registered for the pair is overwritten.
pub(crate) fn create_non_interactive_handshake(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> AppSiloedHandshakeSecrets {
    context
        .call_private_function(registry, NON_INTERACTIVE_HANDSHAKE_SELECTOR, [sender.to_field(), recipient.to_field()])
        .get_preimage()
}

/// Establishes an interactive handshake for `(sender, recipient)` and returns its app-siloed secrets.
///
/// As with [`create_non_interactive_handshake`], the constrained return value is the source of truth for the
/// secrets, so constrained delivery anchoring a freshly bootstrapped handshake needs no separate call to the
/// registry's `validate_handshake`.
///
/// Any handshake already registered for the pair is overwritten.
pub(crate) fn create_interactive_handshake(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> AppSiloedHandshakeSecrets {
    context
        .call_private_function(registry, INTERACTIVE_HANDSHAKE_SELECTOR, [sender.to_field(), recipient.to_field()])
        .get_preimage()
}

/// Fetches discovered handshakes from the HandshakeRegistry and derives app-siloed tagging secrets for each,
/// returning them so that [`get_pending_tagged_logs`](crate::oracle::message_processing::get_pending_tagged_logs)
/// searches for logs tagged with these secrets.
pub(crate) unconstrained fn get_handshake_secrets(
    contract_address: AztecAddress,
    recipient: AztecAddress,
) -> EphemeralArray<ProvidedSecret> {
    let provided_secrets = EphemeralArray::<ProvidedSecret>::empty_at(PROVIDED_SECRETS_ARRAY_BASE_SLOT);

    // Each ephemeral key gets the forgery protection applied (see [`forgery_protected_eph_pk`]) so the oracle's
    // ECDH yields the protected secret the sender stored.
    let protected_eph_pks: EphemeralArray<EmbeddedCurvePoint> = EphemeralArray::empty_at(HANDSHAKE_EPH_PKS_SLOT);
    let recipient_point = recipient.to_address_point().expect(f"recipient address is not on the curve").inner;

    let mut page_offset: u32 = 0;
    let mut has_more = true;
    while has_more {
        let page = fetch_handshake_page(recipient, page_offset);

        for j in 0..page.items.len() {
            protected_eph_pks.push(forgery_protected_eph_pk(page.items.get(j).eph_pk, recipient_point));
        }

        page_offset += page.items.len();
        has_more = page_offset < page.total_count;
    }

    if protected_eph_pks.len() > 0 {
        let secrets = get_shared_secrets(recipient, protected_eph_pks, contract_address);
        for j in 0..secrets.len() {
            let secret = secrets.get(j);
            // Handshakes are mode-agnostic; emit one entry per on-chain tag domain for PXE to scan.
            provided_secrets.push(ProvidedSecret { secret, mode: OnchainDeliveryMode::onchain_unconstrained() });
            provided_secrets.push(ProvidedSecret { secret, mode: OnchainDeliveryMode::onchain_constrained() });
        }
    }

    provided_secrets
}

/// Calls the HandshakeRegistry's `get_non_interactive_handshakes` utility function and deserializes the response.
unconstrained fn fetch_handshake_page(recipient: AztecAddress, page_offset: u32) -> HandshakePage {
    let args: [Field; 2] = [recipient.to_field(), page_offset as Field];
    let response = call_utility_function(
        STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
        GET_NON_INTERACTIVE_HANDSHAKES_SELECTOR,
        args,
    );
    HandshakePage::deserialize(response)
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::messages::delivery::handshake::{
        DiscoveredHandshake, get_handshake_secrets, HandshakePage, MAX_HANDSHAKES_PER_PAGE,
    };
    use crate::messages::delivery::OnchainDeliveryMode;
    use crate::protocol::{address::AztecAddress, traits::{FromField, Serialize}};
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::utils::point::point_from_x_coord;
    use std::test::OracleMock;

    #[test]
    unconstrained fn get_handshake_secrets_returns_secrets_from_single_page() {
        let env = TestEnvironment::new();
        let recipient = AztecAddress::from_field(1);
        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let pk_a = point_from_x_coord(1).unwrap();
            let pk_b = point_from_x_coord(2).unwrap();

            let mut items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            items.push(DiscoveredHandshake { eph_pk: pk_a });
            items.push(DiscoveredHandshake { eph_pk: pk_b });
            let page = HandshakePage { items, total_count: 2 };
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page.serialize());

            let secret_a: Field = 111;
            let secret_b: Field = 222;
            mock_get_shared_secrets([secret_a, secret_b]);

            let secrets = get_handshake_secrets(contract_address, recipient);

            assert_eq(secrets.len(), 4);
            assert_eq(secrets.get(0).secret, secret_a);
            assert(secrets.get(0).mode == OnchainDeliveryMode::onchain_unconstrained());
            assert_eq(secrets.get(1).secret, secret_a);
            assert(secrets.get(1).mode == OnchainDeliveryMode::onchain_constrained());
            assert_eq(secrets.get(2).secret, secret_b);
            assert(secrets.get(2).mode == OnchainDeliveryMode::onchain_unconstrained());
            assert_eq(secrets.get(3).secret, secret_b);
            assert(secrets.get(3).mode == OnchainDeliveryMode::onchain_constrained());
        });
    }

    #[test]
    unconstrained fn get_handshake_secrets_fetches_multiple_pages() {
        let env = TestEnvironment::new();
        let recipient = AztecAddress::from_field(1);
        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let pk_a = point_from_x_coord(1).unwrap();
            let pk_b = point_from_x_coord(2).unwrap();
            let pk_c = point_from_x_coord(8).unwrap();

            let mut page_1_items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            page_1_items.push(DiscoveredHandshake { eph_pk: pk_a });
            page_1_items.push(DiscoveredHandshake { eph_pk: pk_b });
            let page_1 = HandshakePage { items: page_1_items, total_count: 3 };

            let mut page_2_items: BoundedVec<DiscoveredHandshake, MAX_HANDSHAKES_PER_PAGE> = BoundedVec::new();
            page_2_items.push(DiscoveredHandshake { eph_pk: pk_c });
            let page_2 = HandshakePage { items: page_2_items, total_count: 3 };

            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page_1.serialize()).times(1);
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page_2.serialize()).times(1);

            mock_get_shared_secrets([111, 222, 333]);

            let secrets = get_handshake_secrets(contract_address, recipient);
            assert_eq(secrets.len(), 6);
            assert_eq(secrets.get(0).secret, 111);
            assert(secrets.get(0).mode == OnchainDeliveryMode::onchain_unconstrained());
            assert_eq(secrets.get(1).secret, 111);
            assert(secrets.get(1).mode == OnchainDeliveryMode::onchain_constrained());
            assert_eq(secrets.get(2).secret, 222);
            assert(secrets.get(2).mode == OnchainDeliveryMode::onchain_unconstrained());
            assert_eq(secrets.get(3).secret, 222);
            assert(secrets.get(3).mode == OnchainDeliveryMode::onchain_constrained());
            assert_eq(secrets.get(4).secret, 333);
            assert(secrets.get(4).mode == OnchainDeliveryMode::onchain_unconstrained());
            assert_eq(secrets.get(5).secret, 333);
            assert(secrets.get(5).mode == OnchainDeliveryMode::onchain_constrained());
        });
    }

    #[test]
    unconstrained fn get_handshake_secrets_returns_empty_when_recipient_keys_not_held() {
        let env = TestEnvironment::new();
        let recipient = AztecAddress::from_field(1);
        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let mut items = BoundedVec::new();
            items.push(DiscoveredHandshake { eph_pk: point_from_x_coord(1).unwrap() });
            let page = HandshakePage { items, total_count: 1 };
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(page.serialize());

            let empty: [Field; 0] = [];
            mock_get_shared_secrets(empty);

            let secrets = get_handshake_secrets(contract_address, recipient);
            assert_eq(secrets.len(), 0);
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
