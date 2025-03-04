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
    static constexpr uint32_t COMPONENT_SIZE = ComponentType::PUBLIC_INPUTS_SIZE;

  public:
    using Key = PublicComponentKey;

    // WORKTODO: maybe template this class on Builder?
    using Fr = stdlib::field_t<MegaCircuitBuilder>;

    PublicInputComponent() = default;
    PublicInputComponent(const Key& key)
        : key_(key)
    {}

    const Key& key() const { return key_; }

    void set(const ComponentType& component)
    {
        key_.start_idx = component.set_public();
        key_.exists_flag = true;
    }

    ComponentType reconstruct(const std::vector<Fr>& public_inputs) const
    {
        // Ensure that the key has been set
        if (!key_exists()) {
            info("WARNING: Trying to construct a PublicInputComponent from an invalid key!");
            ASSERT(false);
        }
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key_.start_idx, COMPONENT_SIZE };
        return ComponentType::reconstruct_from_public(limbs);
    }

    // WORKTODO: this might be simpler if the above version is not needed.
    static ComponentType reconstruct(const std::vector<Fr>& public_inputs, const Key& key)
    {
        // Ensure that the key has been set
        if (!key.exists_flag) {
            info("WARNING: Trying to construct a PublicInputComponent from an invalid key!");
            // ASSERT(false);
        }
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key.start_idx, COMPONENT_SIZE };
        return ComponentType::reconstruct_from_public(limbs);
    }

  private:
    Key key_;

    bool key_exists() const { return key_.exists_flag; }
};

} // namespace bb::stdlib
