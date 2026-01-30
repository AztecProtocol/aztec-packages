// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"

namespace bb {

/**
 * @brief A flavor for the AVM recursive verifier circuit arithmetized with Mega.
 * @details The AVM recursive verifier is a Mega-arithmetized circuit that verifies AVM proofs.
 */
class MegaAvmFlavor : public bb::MegaFlavor {
  public:
    // Override VIRTUAL_LOG_N for the AVM recursive verifier circuit
    static constexpr size_t VIRTUAL_LOG_N = MEGA_AVM_LOG_N;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }
};

} // namespace bb
