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
    // The data needed to reconstruct the component from its limbs stored in the public inputs
    struct Key {
        uint32_t start_idx = 0; // start index within public inputs array
        uint32_t size = 0;      // length of sub-array within public inputs array
        bool exists = false;    // WORKTODO: maybe just use condition on idx? like == uint32_t(-1)?
    };

    Key key;

  public:
    using Fr = stdlib::field_t<MegaCircuitBuilder>;

    PublicInputComponent() = default;
    PublicInputComponent(const Key& key_in)
        : key(key_in)
    {}

    const Key& get_key() const { return key; }

    void set(const ComponentType& component)
    {
        key.start_idx = component.set_public();
        key.size = ComponentType::PUBLIC_INPUTS_SIZE;
        key.exists = true;
    }

    ComponentType reconstruct(const std::vector<Fr>& public_inputs) const
    {
        // Ensure that the key has been set
        if (!key.exists) {
            info("WARNING: Trying to construct a PublicInputComponent from a key that has not been set!");
            ASSERT(false);
        }
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key.start_idx, key.size };
        return ComponentType::reconstruct_from_public(limbs);
    }
};

} // namespace bb::stdlib
