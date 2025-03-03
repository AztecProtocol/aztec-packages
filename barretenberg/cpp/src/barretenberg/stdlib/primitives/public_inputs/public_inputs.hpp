#pragma once

#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <cstdint>
namespace bb::stdlib {

struct PublicInputComponentKey {
    uint32_t start_idx = 0; // start index within public inputs array
    uint32_t size = 0;      // length of sub-array within public inputs array
    bool exists = false;    // WORKTODO: maybe just use condition on idx? like == uint32_t(-1)?
};

template <typename ComponentType>
concept HasSetAndReconstruct =
    requires(ComponentType component, std::vector<stdlib::field_t<MegaCircuitBuilder>> public_inputs) {
        {
            component.set_public()
        } -> std::same_as<void>;
        {
            ComponentType::reconstruct_from_public(public_inputs)
        } -> std::same_as<ComponentType>;
    };

template <typename ComponentType>
    requires HasSetAndReconstruct<ComponentType>
class PublicInputComponent {
    PublicInputComponentKey key; // {start index, size, existence flag}

  public:
    using Fr = stdlib::field_t<MegaCircuitBuilder>;
    PublicInputComponent() = default;

    void set(const ComponentType& component) { component.set_public(); }

    ComponentType reconstruct(const std::vector<field_t<MegaCircuitBuilder>>& public_inputs) const
    {
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key.start_idx, key.size };
        return ComponentType::reconstruct_from_public(limbs);
    }
};

} // namespace bb::stdlib
