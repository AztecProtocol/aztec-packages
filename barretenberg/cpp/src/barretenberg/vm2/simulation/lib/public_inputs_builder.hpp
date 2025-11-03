#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

namespace bb::avm2::simulation {

class PublicInputsBuilder {
  public:
    PublicInputsBuilder& extract_inputs(const Tx& tx,
                                        const GlobalVariables& global_variables,
                                        const ProtocolContracts& protocol_contracts,
                                        const FF& prover_id,
                                        const LowLevelMerkleDBInterface& merkle_db);

    PublicInputsBuilder& extract_outputs(const LowLevelMerkleDBInterface& merkle_db,
                                         const Gas& end_gas_used,
                                         const FF& transaction_fee,
                                         const bool reverted,
                                         const TrackedSideEffects& side_effects);

    PublicInputs build() const { return public_inputs_; }

  private:
    PublicInputs public_inputs_;
};

} // namespace bb::avm2::simulation
