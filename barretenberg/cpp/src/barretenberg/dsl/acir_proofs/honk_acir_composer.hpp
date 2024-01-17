#pragma once
#include <barretenberg/dsl/acir_format/acir_format.hpp>
#include <barretenberg/goblin/goblin.hpp>

namespace acir_proofs {

/**
 * @brief A class responsible for marshalling construction of keys and prover and verifier instances used to prove
 * satisfiability of circuits written in ACIR.
 * @todo: This reflects the design of Plonk. Perhaps we should author new classes to better reflect the
 * structure of the newer code since there's much more of that code now?
 */
class HonkAcirComposer {

    using WitnessVector = std::vector<fr, ContainerSlabAllocator<fr>>;

  public:
    HonkAcirComposer();

    // Goblin specific methods
    void create_circuit(acir_format::acir_format& constraint_system, acir_format::WitnessVector& witness);
    std::vector<uint8_t> accumulate();
    bool verify_accumulator(std::vector<uint8_t> const& proof);

  private:
    acir_format::GoblinBuilder goblin_builder_;
    Goblin goblin;
    bool verbose_ = true;

    template <typename... Args> inline void vinfo(Args... args)
    {
        if (verbose_) {
            info(args...);
        }
    }
};

} // namespace acir_proofs
