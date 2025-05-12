// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <cstdint>
namespace bb::stdlib {

/**
 * @brief A concept defining requirements for types that are to be serialized to and from the public inputs of a circuit
 * via the PublicInputComponent class.
 *
 * @tparam ComponentType The type of the object to be serialized
 */
template <typename ComponentType>
concept IsSerializableToAndFromPublicInputs = requires(
    ComponentType component,
    std::span<stdlib::field_t<typename ComponentType::Builder>, ComponentType::PUBLIC_INPUTS_SIZE> public_inputs) {
    { // A method to set the limbs of the object to public and return the index of the first limb in public inputs
        component.set_public()
    } -> std::same_as<uint32_t>;
    { // A method to reconstruct the object from the limbs stored in public inputs
        ComponentType::reconstruct_from_public(public_inputs)
    } -> std::same_as<ComponentType>;
    { // A constant defining the number of limbs needed to represent the object in the public inputs
        ComponentType::PUBLIC_INPUTS_SIZE
    } -> std::convertible_to<size_t>;
};

/**
 * @brief A wrapper class for serializing objects to and from the public inputs of a circuit
 *
 * @tparam ComponentType A type that satisfies the IsSerializableToAndFromPublicInputs concept
 */
template <typename ComponentType>
    requires IsSerializableToAndFromPublicInputs<ComponentType>
class PublicInputComponent {
    using Builder = ComponentType::Builder;
    using Fr = stdlib::field_t<Builder>; // type for native field elements in the circuit (i.e. the type for "limbs")

    static constexpr uint32_t COMPONENT_SIZE = ComponentType::PUBLIC_INPUTS_SIZE;

  public:
    using Key = PublicComponentKey;

    // Set witness indices of the component to public; return key indicating location of the component in the pub inputs
    static Key set(const ComponentType& component)
    {
        Key key;
        key.start_idx = component.set_public();
        return key;
    }

    // Reconstruct the component from the public inputs and the key indicating its location
    static ComponentType reconstruct(const std::vector<Fr>& public_inputs, const Key& key)
    {
        // Ensure that the key has been set
        if (!key.is_set()) {
            ASSERT(false && "ERROR: Trying to construct a PublicInputComponent from an invalid key!");
        }

        // Use the provided key to extract the limbs of the component from the public inputs then reconstruct it
        ASSERT(key.start_idx + COMPONENT_SIZE <= public_inputs.size() &&
               "PublicInputComponent cannot be reconstructed - PublicInputComponentKey start_idx out of bounds");
        std::span<const Fr, COMPONENT_SIZE> limbs{ public_inputs.data() + key.start_idx, COMPONENT_SIZE };
        return ComponentType::reconstruct_from_public(limbs);
    }
};

} // namespace bb::stdlib
