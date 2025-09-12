// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/public_input_component/public_component_key.hpp"
#include <cstdint>
#include <span>
namespace bb {

/**
 * @brief A concept defining requirements for types that are to be deserialized from the public inputs of a circuit
 * via the PublicInputComponent class.
 *
 * @tparam ComponentType The type of the object to be deserialized
 */
template <typename ComponentType>
concept IsDeserializableFromPublicInputs =
    requires(std::span<bb::fr, ComponentType::PUBLIC_INPUTS_SIZE> public_inputs) {
        { // A method to reconstruct the object from the limbs stored in public inputs
            ComponentType::reconstruct_from_public(public_inputs)
        } -> std::same_as<ComponentType>;
        { // A constant defining the number of limbs needed to represent the object in the public inputs
            ComponentType::PUBLIC_INPUTS_SIZE
        } -> std::convertible_to<size_t>;
    };

/**
 * @brief A wrapper class for deserializing objects from the public inputs of a circuit
 *
 * @tparam ComponentType A type that satisfies the IsDeserializableFromPublicInputs concept
 */
template <typename ComponentType>
    requires IsDeserializableFromPublicInputs<ComponentType>
class PublicInputComponent {
    static constexpr uint32_t COMPONENT_SIZE = ComponentType::PUBLIC_INPUTS_SIZE;

  public:
    using Key = PublicComponentKey;

    // Reconstruct the component from the public inputs and the key indicating its location
    static ComponentType reconstruct(const std::vector<bb::fr>& public_inputs, const Key& key)
    {
        // Ensure that the key has been set
        if (!key.is_set()) {
            throw_or_abort("ERROR: Trying to construct a PublicInputComponent from an invalid key!");
        }

        // Use the provided key to extract the limbs of the component from the public inputs then reconstruct it
        BB_ASSERT_LTE(key.start_idx + COMPONENT_SIZE,
                      public_inputs.size(),
                      "PublicInputComponent cannot be reconstructed - PublicInputComponentKey start_idx out of bounds");
        std::span<const bb::fr, COMPONENT_SIZE> limbs{ public_inputs.data() + key.start_idx, COMPONENT_SIZE };
        return ComponentType::reconstruct_from_public(limbs);
    }
};

} // namespace bb
