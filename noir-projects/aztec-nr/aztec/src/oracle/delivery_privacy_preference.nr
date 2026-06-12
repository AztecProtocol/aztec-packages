use crate::messages::delivery::{DeliveryPrivacyPreference, OnchainDeliveryMode};
use crate::protocol::address::AztecAddress;

/// Returns the wallet's [`DeliveryPrivacyPreference`] for a message sent from `sender` to `recipient` with the given
/// delivery `mode`.
pub(crate) unconstrained fn get_delivery_privacy_preference(
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> DeliveryPrivacyPreference {
    get_delivery_privacy_preference_oracle(sender, recipient, mode)
}

#[oracle(aztec_prv_getDeliveryPrivacyPreference)]
unconstrained fn get_delivery_privacy_preference_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
    _mode: OnchainDeliveryMode,
) -> DeliveryPrivacyPreference {}
