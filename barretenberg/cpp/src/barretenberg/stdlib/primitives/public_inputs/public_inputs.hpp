#pragma once

#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <cstdint>
namespace bb::stdlib {

// A concept defining requirements for types that can be represented as a PublicInputComponent
template <typename ComponentType>
concept HasSetAndReconstruct =
    requires(ComponentType component, std::vector<stdlib::field_t<MegaCircuitBuilder>> public_inputs) {
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

template <typename ComponentType>
    requires HasSetAndReconstruct<ComponentType>
class PublicInputComponent {
    using Builder = ComponentType::Builder;
    using Fr = stdlib::field_t<Builder>;
    using Key = PublicComponentKey;

    static constexpr uint32_t COMPONENT_SIZE = ComponentType::PUBLIC_INPUTS_SIZE;

  public:
    // Set witness indices of the component to public; return key indicating location of the component in the pub inputs
    static Key set(const ComponentType& component)
    {
        Key key;
        key.start_idx = component.set_public();
        key.exists_flag = true;
        return key;
    }

    // Reconstruct the component from the public inputs and the key indicating its location
    static ComponentType reconstruct(const std::vector<Fr>& public_inputs, const Key& key)
    {
        // WORKTODO: figure out what to do with this check
        // Ensure that the key has been set
        if (!key.exists_flag) {
            info("WARNING: Trying to construct a PublicInputComponent from an invalid key!");
            // ASSERT(false);
        }
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key.start_idx, COMPONENT_SIZE };
        return ComponentType::reconstruct_from_public(limbs);
    }
};

} // namespace bb::stdlib
