#pragma once

#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/update_check.hpp"

namespace bb::avm2::simulation {

class UpdateCheck : public UpdateCheckInterface {
  public:
    UpdateCheck(Poseidon2Interface& poseidon2,
                RangeCheckInterface& range_check,
                GreaterThanInterface& gt,
                HighLevelMerkleDBInterface& merkle_db,
                EventEmitterInterface<UpdateCheckEvent>& read_event_emitter,
                const GlobalVariables& globals)
        : update_check_events(read_event_emitter)
        , poseidon2(poseidon2)
        , range_check(range_check)
        , gt(gt)
        , merkle_db(merkle_db)
        , globals(globals)
    {}

    void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) override;

  private:
    EventEmitterInterface<UpdateCheckEvent>& update_check_events;
    Poseidon2Interface& poseidon2;
    RangeCheckInterface& range_check;
    GreaterThanInterface& gt;
    HighLevelMerkleDBInterface& merkle_db;
    const GlobalVariables& globals;
};

} // namespace bb::avm2::simulation
