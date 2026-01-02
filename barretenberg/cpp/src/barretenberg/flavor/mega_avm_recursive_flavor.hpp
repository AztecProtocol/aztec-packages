// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"

namespace bb {

/**
 * @brief Recursive flavor for verifying proofs produced with MegaAvmFlavor.
 * @details Used by the outer Ultra circuit when recursively verifying the Mega proof
 * of the AVM recursive verifier circuit.
 */
template <typename BuilderType> class MegaAvmRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using Base = MegaRecursiveFlavor_<BuilderType>;
    using NativeFlavor = MegaAvmFlavor;

    // Re-export types from base class
    using Commitment = typename Base::Commitment;
    using VerificationKey = typename Base::VerificationKey;
    using FF = typename Base::FF;

    // Override VIRTUAL_LOG_N to match MegaAvmFlavor
    static constexpr size_t VIRTUAL_LOG_N = MegaAvmFlavor::VIRTUAL_LOG_N;
};

} // namespace bb
