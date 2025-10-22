#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

class PublicInputsBuilder {
  public:
    PublicInputsBuilder& extract_inputs(const Tx& tx,
                                        const GlobalVariables& global_variables,
                                        const ProtocolContracts& protocol_contracts,
                                        const FF& prover_id,
                                        const LowLevelMerkleDBInterface& merkle_db);

    PublicInputsBuilder& extract_outputs(const LowLevelMerkleDBInterface& merkle_db);

    PublicInputs build() const { return public_inputs_; }

  private:
    PublicInputs public_inputs_;
};

} // namespace bb::avm2::simulation
