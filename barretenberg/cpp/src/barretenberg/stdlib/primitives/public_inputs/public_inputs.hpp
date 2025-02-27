#pragma once

#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <cstdint>
namespace bb::stdlib {

namespace public_inputs {

static constexpr size_t NUM_FR_LIMBS_PER_BASE_FIELD_BN254 = 4;
static constexpr size_t NUM_FR_LIMBS_PER_POINT_BN254 = NUM_FR_LIMBS_PER_BASE_FIELD_BN254 * 2;

// WORKTODO: make this a method on goblin element class
// Set the witness indices of a Goblin biggroup object to public
inline void set_public(const bb::stdlib::GoblinBigGroup& point)
{
    using Builder = MegaCircuitBuilder;
    using BigFq = stdlib::bigfield<Builder, bb::fq::Params>;
    using Fr = stdlib::field_t<Builder>;
    const auto to_bigfield_witness_indices = [](const Fr& lo, const Fr& hi) {
        BigFq r(lo, hi);
        return std::array<uint32_t, 4>{
            r.binary_basis_limbs[0].element.normalize().witness_index,
            r.binary_basis_limbs[1].element.normalize().witness_index,
            r.binary_basis_limbs[2].element.normalize().witness_index,
            r.binary_basis_limbs[3].element.normalize().witness_index,
        };
    };

    auto x = to_bigfield_witness_indices(point.x.limbs[0], point.x.limbs[1]);
    auto y = to_bigfield_witness_indices(point.y.limbs[0], point.y.limbs[1]);

    Builder* context = point.get_context();
    for (const uint32_t& idx : x) {
        context->set_public_input(idx);
    }
    for (const uint32_t& idx : y) {
        context->set_public_input(idx);
    }
}

// Reconstruct a Goblin biggroup object from public inputs
inline GoblinBigGroup reconstruct(const std::span<const stdlib::field_t<MegaCircuitBuilder>>& limbs)
{
    using Builder = MegaCircuitBuilder;
    using Fr = stdlib::field_t<Builder>;
    using Fq = GoblinBigGroup::BaseField;

    const size_t FRS_PER_FQ = NUM_FR_LIMBS_PER_BASE_FIELD_BN254;

    std::span<const Fr, FRS_PER_FQ> x_limbs{ limbs.data(), FRS_PER_FQ };
    std::span<const Fr, FRS_PER_FQ> y_limbs{ limbs.data() + FRS_PER_FQ, FRS_PER_FQ };

    auto reconstruct_fq_from_fr_limbs = [](const std::span<const Fr, FRS_PER_FQ>& limbs) {
        for (size_t i = 0; i < FRS_PER_FQ; ++i) {
            // WORKTODO: do we need to range constrain here?
            limbs[i].create_range_constraint(Fq::NUM_LIMB_BITS, "l" + std::to_string(i));
        }
        return Fq::construct_from_limbs(limbs[0], limbs[1], limbs[2], limbs[3], /*can_overflow=*/false);
    };

    const Fq x = reconstruct_fq_from_fr_limbs(x_limbs);
    const Fq y = reconstruct_fq_from_fr_limbs(y_limbs);

    return { x, y };
}

} // namespace public_inputs

struct PublicInputComponentKey {
    uint32_t start_idx = 0; // start index within public inputs array
    uint32_t size = 0;      // length of sub-array within public inputs array
    bool exists = false;    // WORKTODO: maybe just use condition on idx? like == uint32_t(-1)?
};

template <typename ComponentType>
concept HasSetAndReconstruct =
    requires(ComponentType component, std::vector<stdlib::field_t<MegaCircuitBuilder>> public_inputs) {
        {
            public_inputs::set_public(component)
        } -> std::same_as<void>;
        {
            public_inputs::reconstruct(public_inputs)
        } -> std::same_as<ComponentType>;
    };

template <typename ComponentType>
    requires HasSetAndReconstruct<ComponentType>
class PublicInputComponent {
    PublicInputComponentKey key; // {start index, size, existence flag}

  public:
    using Fr = stdlib::field_t<MegaCircuitBuilder>;
    PublicInputComponent() = default;

    void set(const ComponentType& component) { public_inputs::set_public(component); }

    ComponentType reconstruct(const std::vector<field_t<MegaCircuitBuilder>>& public_inputs) const
    {
        // Extract from the public inputs the limbs needed reconstruct the component
        std::span<const Fr> limbs{ public_inputs.data() + key.start_idx, key.size };
        return public_inputs::reconstruct(limbs);
    }
};

} // namespace bb::stdlib
