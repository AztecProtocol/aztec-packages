#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb {

/**
 * @brief The wires and selectors used to define a block in the execution trace
 *
 * @tparam Arithmetization The set of selectors corresponding to the arithmetization
 */
template <class Arithmetization> struct ExecutionTraceBlock {
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Arithmetization::NUM_WIRES>;
    Wires wires;
    Arithmetization selectors;
};

template <class Flavor> class ExecutionTrace_ {
    using Builder = typename Flavor::CircuitBuilder;
    using Polynomial = typename Flavor::Polynomial;
    using FF = typename Flavor::FF;
    using TraceBlock = ExecutionTraceBlock<typename Builder::Selectors>;
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Builder::NUM_WIRES>;
    using Selectors = typename Builder::Selectors;
    using ProvingKey = typename Flavor::ProvingKey;

  public:
    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;

    struct TraceData {
        std::array<Polynomial, NUM_WIRES> wires;
        std::array<Polynomial, Builder::Selectors::NUM_SELECTORS> selectors;
        std::vector<CyclicPermutation> copy_cycles;

        TraceData(size_t dyadic_circuit_size, Builder& builder)
        {
            // Initializate the wire and selector polynomials
            for (auto& wire : wires) {
                wire = Polynomial(dyadic_circuit_size);
            }
            for (auto& selector : selectors) {
                selector = Polynomial(dyadic_circuit_size);
            }
            // Initialize the vector of copy cycles; these are simply collections of indices into the wire polynomials
            // whose values are copy constrained to be equal. Each variable represents one cycle.
            copy_cycles.resize(builder.variables.size()); // WORKTODO: real_variables.size()?
        }
    };

    static std::shared_ptr<ProvingKey> generate(Builder& builder, size_t dyadic_circuit_size);

  private:
    static std::shared_ptr<ProvingKey> generate_honk_proving_key(TraceData& trace_data,
                                                                 Builder& builder,
                                                                 size_t dyadic_circuit_size)
        requires IsUltraFlavor<Flavor>;

    static std::shared_ptr<ProvingKey> generate_plonk_proving_key(TraceData& trace_data,
                                                                  Builder& builder,
                                                                  size_t dyadic_circuit_size)
        requires IsPlonkFlavor<Flavor>;

    static TraceData construct_trace_polynomials(Builder& builder, size_t dyadic_circuit_size);

    /**
     * @brief Temporary helper method to construct execution trace blocks from existing builder structures
     * @details Eventually the builder will construct blocks directly
     *
     * @param builder
     * @return std::vector<TraceBlock>
     */
    static std::vector<TraceBlock> create_execution_trace_blocks(Builder& builder);
};

} // namespace bb