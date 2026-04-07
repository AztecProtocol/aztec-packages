// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief Base class interface for IVC schemes
 *
 * Provides common interface for different IVC implementations Chonk allowing them to be
 * used polymorphically in the API.
 */
class IVCBase {
    // CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.
  public:
    using ClientCircuit = MegaCircuitBuilder;
    using MegaVerificationKey = MegaZKFlavor::VerificationKey;

    virtual ~IVCBase() = default;

    virtual Goblin& get_goblin() = 0;
    virtual const Goblin& get_goblin() const = 0;

    virtual void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk) = 0;

    // Returns the Poseidon2 op queue for IVC schemes that defer Poseidon2 hashing (ChonkV2).
    // Returns nullptr for schemes that don't (Chonk).
    virtual std::shared_ptr<Poseidon2OpQueue> get_poseidon2_op_queue() { return nullptr; }

  protected:
    IVCBase() = default;
};

} // namespace bb
