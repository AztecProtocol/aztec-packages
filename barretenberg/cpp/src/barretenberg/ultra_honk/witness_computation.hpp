#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
namespace bb {
/**
 * @brief Methods for managing the compututation of derived witness polynomials such as the permutation grand product,
 * log-derivative lookup inverses, and RAM/RAM memory records
 *
 * @tparam Flavor
 */
template <IsUltraFlavor Flavor> class WitnessComputation {
    using FF = typename Flavor::FF;

  public:
    static void add_ram_rom_memory_records_to_wire_4(Flavor::ProvingKey& proving_key,
                                                     const FF& eta,
                                                     const FF& eta_two,
                                                     const FF& eta_three);

    static void compute_logderivative_inverses(Flavor::ProvingKey& proving_key,
                                               RelationParameters<FF>& relation_parameters);

    static void compute_grand_product_polynomial(Flavor::ProvingKey& proving_key,
                                                 RelationParameters<FF>& relation_parameters,
                                                 size_t size_override = 0);

    static void complete_proving_key_for_test(const std::shared_ptr<DeciderProvingKey_<Flavor>>& decider_pk);
};

} // namespace bb