// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/public_input_component/public_component_key.hpp"
#include <cstdint>
#include <span>
namespace bb {

/**
 * @brief A concept for types that can be deserialized from public inputs
 */
template <typename ComponentType>
concept IsDeserializableFromPublicInputs = requires {
    { ComponentType::PUBLIC_INPUTS_SIZE } -> std::convertible_to<size_t>;
};

/**
 * @brief Check if a type has reconstruct_from_public method
 */
template <typename T>
concept HasReconstructFromPublic = requires(std::span<bb::fr, T::PUBLIC_INPUTS_SIZE> limbs) {
    { T::reconstruct_from_public(limbs) } -> std::same_as<T>;
};

/**
 * @brief A wrapper class for deserializing objects from the public inputs of a circuit
 *
 * @tparam ComponentType A type that satisfies the IsDeserializableFromPublicInputs concept
 */
template <typename ComponentType>
    requires IsDeserializableFromPublicInputs<ComponentType>
class PublicInputComponent {
    using Codec = FrCodec;
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

        // Use reconstruct_from_public if available (for composite types like OpeningClaim),
        // otherwise use Codec (for primitives and array-like types like PairingPoints)
        if constexpr (HasReconstructFromPublic<ComponentType>) {
            return ComponentType::reconstruct_from_public(limbs);
        } else {
            return Codec::deserialize_from_fields<ComponentType>(limbs);
        }
    }
};

} // namespace bb
