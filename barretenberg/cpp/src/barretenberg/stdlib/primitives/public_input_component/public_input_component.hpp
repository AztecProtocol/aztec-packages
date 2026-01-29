// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include <cstdint>
namespace bb::stdlib {

/**
 * @brief A concept for types that can be serialized to public inputs
 */
template <typename ComponentType>
concept IsSerializableToPublicInputs = requires(ComponentType component) {
    { component.set_public() } -> std::same_as<uint32_t>;
    { ComponentType::PUBLIC_INPUTS_SIZE } -> std::convertible_to<size_t>;
};

/**
 * @brief Check if a type has reconstruct_from_public method
 */
template <typename T, typename Fr>
concept HasReconstructFromPublic = requires(std::span<Fr, T::PUBLIC_INPUTS_SIZE> limbs) {
    { T::reconstruct_from_public(limbs) } -> std::same_as<T>;
};

/**
 * @brief A wrapper class for serializing objects to and from the public inputs of a circuit
 *
 * @tparam ComponentType A type that satisfies the IsSerializableToPublicInputs concept
 */
template <typename ComponentType>
    requires IsSerializableToPublicInputs<ComponentType>
class PublicInputComponent {
    using Builder = ComponentType::Builder;
    using Fr = stdlib::field_t<Builder>;
    using Codec = StdlibCodec<Fr>;

    static constexpr size_t COMPONENT_SIZE = ComponentType::PUBLIC_INPUTS_SIZE;

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
            throw_or_abort("ERROR: Trying to construct a PublicInputComponent from an invalid key!");
        }

        // Use the provided key to extract the limbs of the component from the public inputs then reconstruct it
        if (key.start_idx + COMPONENT_SIZE > public_inputs.size()) {
            throw_or_abort("PublicInputComponent::reconstruct: public_inputs vector too small");
        }
        std::span<const Fr, COMPONENT_SIZE> limbs{ public_inputs.data() + key.start_idx, COMPONENT_SIZE };

        // Use reconstruct_from_public if available (for composite types like OpeningClaim),
        // otherwise use Codec (for primitives and array-like types like PairingPoints)
        if constexpr (HasReconstructFromPublic<ComponentType, Fr>) {
            return ComponentType::reconstruct_from_public(limbs);
        } else {
            return Codec::template deserialize_from_fields<ComponentType>(limbs);
        }
    }
};

} // namespace bb::stdlib
