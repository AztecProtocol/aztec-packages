// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief TEST only helper for completing computation of the prover polynomials using random challenges
 *
 * @tparam Flavor
 * @param prover_inst
 */
template <typename Flavor>
void complete_prover_instance_for_test(const std::shared_ptr<ProverInstance_<Flavor>>& prover_inst)
{
    using FF = typename Flavor::FF;

    // Generate random eta, beta, gamma, compute powers
    prover_inst->relation_parameters.compute_eta_powers(FF::random_element());
    prover_inst->relation_parameters.compute_beta_powers(FF::random_element());
    prover_inst->relation_parameters.gamma = FF::random_element();

    OinkProver<Flavor>::add_ram_rom_memory_records_to_wire_4(*prover_inst);
    OinkProver<Flavor>::compute_logderivative_inverses(*prover_inst);
    uint32_t z_perm_dup_count = 0; // unused here; the count only feeds the prover's MSM dedup hint
    OinkProver<Flavor>::compute_grand_product_polynomial(*prover_inst, z_perm_dup_count);
}

} // namespace bb
