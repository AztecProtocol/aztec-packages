#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/ecadd.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

namespace detail {

inline void mutate_affine_point(grumpkin::g1::affine_element& point, std::mt19937_64& rng)
{
    switch (std::uniform_int_distribution<uint8_t>(0, 2)(rng)) {
    case 0:
        point = grumpkin::g1::affine_element::one();
        break;
    case 1:
        point = grumpkin::g1::affine_element::random_element();
        break;
    case 2:
        point = grumpkin::g1::affine_element::infinity();
        break;
    default:
        break;
    }
}

} // namespace detail

inline void fault_injection_address_derivation(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.address_derivation.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.address_derivation.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_ADDRESS_DERIVATION_EVENT_CONFIGURATION.select(rng);
    auto& event = events.address_derivation[index];
    switch (mutation) {
    case FaultInjectionAddressDerivationEventOptions::Address:
        mutate_field(event.address, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::Salt:
        mutate_field(event.instance.salt, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::Deployer:
        mutate_field(event.instance.deployer, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::ClassId:
        mutate_field(event.instance.original_contract_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::InitHash:
        mutate_field(event.instance.initialization_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::NullifierKey:
        detail::mutate_affine_point(event.instance.public_keys.nullifier_key, rng);
        break;
    case FaultInjectionAddressDerivationEventOptions::IncomingViewingKey:
        detail::mutate_affine_point(event.instance.public_keys.incoming_viewing_key, rng);
        break;
    case FaultInjectionAddressDerivationEventOptions::OutgoingViewingKey:
        detail::mutate_affine_point(event.instance.public_keys.outgoing_viewing_key, rng);
        break;
    case FaultInjectionAddressDerivationEventOptions::TaggingKey:
        detail::mutate_affine_point(event.instance.public_keys.tagging_key, rng);
        break;
    case FaultInjectionAddressDerivationEventOptions::SaltedInitHash:
        mutate_field(event.salted_initialization_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::PartialAddress:
        mutate_field(event.partial_address, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::PublicKeysHash:
        mutate_field(event.public_keys_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::Preaddress:
        mutate_field(event.preaddress, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionAddressDerivationEventOptions::PreaddressPublicKey:
        mutate_embedded_curve_point(event.preaddress_public_key, rng);
        break;
    case FaultInjectionAddressDerivationEventOptions::AddressPoint:
        mutate_embedded_curve_point(event.address_point, rng);
        break;
    }
}

} // namespace bb::avm2::fuzzer
