#pragma once

#include "barretenberg/flavor/mega_flavor.hpp"
#include <cstdint>

namespace bb {

/**
 * @brief Methods for estimating memory in key components of MegaHonk
 *
 */
class MegaMemoryEstimator {
    using FF = MegaFlavor::FF;

  public:
    static uint64_t estimate_proving_key_memory(MegaFlavor::ProvingKey& proving_key)
    {
        vinfo("++Estimating proving key memory++");

        auto& polynomials = proving_key.polynomials;

        for (auto [polynomial, label] : zip_view(polynomials.get_all(), polynomials.get_labels())) {
            uint64_t size = polynomial.size();
            vinfo(label, " num: ", size, " size: ", (size * sizeof(FF)) >> 10, " KiB");
        }

        uint64_t result(0);
        for (auto& polynomial : polynomials.get_unshifted()) {
            result += polynomial.size() * sizeof(FF);
        }

        result += proving_key.public_inputs.capacity() * sizeof(FF);

        return result;
    }

    static uint64_t estimate_builder_memory(MegaFlavor::CircuitBuilder& builder)
    {
        vinfo("++Estimating builder memory++");
        uint64_t result{ 0 };

        // gates:
        for (auto [block, label] : zip_view(builder.blocks.get(), builder.blocks.get_labels())) {
            uint64_t size{ 0 };
            for (const auto& wire : block.wires) {
                size += wire.capacity() * sizeof(uint32_t);
            }
            for (const auto& selector : block.selectors) {
                size += selector.capacity() * sizeof(FF);
            }
            vinfo(label, " size ", size >> 10, " KiB");
            result += size;
        }

        // variables
        size_t to_add{ builder.get_variables().capacity() * sizeof(FF) };
        result += to_add;
        vinfo("variables: ", to_add);

        // public inputs
        to_add = builder.public_inputs.capacity() * sizeof(uint32_t);
        result += to_add;
        vinfo("public inputs: ", to_add);

        // other variable indices
        to_add = builder.next_var_index.capacity() * sizeof(uint32_t);
        to_add += builder.prev_var_index.capacity() * sizeof(uint32_t);
        to_add += builder.real_variable_index.capacity() * sizeof(uint32_t);
        to_add += builder.real_variable_tags.capacity() * sizeof(uint32_t);
        result += to_add;
        vinfo("variable indices: ", to_add);

        return result;
    }
};

} // namespace bb
