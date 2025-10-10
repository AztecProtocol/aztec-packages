// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Base class interface for IVC schemes
 *
 * Provides common interface for different IVC implementations (ClientIVC, SumcheckClientIVC) allowing them to be used
 * polymorphically in the API.
 */
class IVCBase {
  public:
    using ClientCircuit = MegaCircuitBuilder;
    using MegaVerificationKey = MegaFlavor::VerificationKey;

    virtual ~IVCBase() = default;

    virtual Goblin& get_goblin() = 0;
    virtual const Goblin& get_goblin() const = 0;

    virtual void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk) = 0;

  protected:
    IVCBase() = default;
};

} // namespace bb
