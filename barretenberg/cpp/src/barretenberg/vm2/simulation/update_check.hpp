#pragma once

#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class UpdateCheckInterface {
  public:
    virtual ~UpdateCheckInterface() = default;
    virtual void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) = 0;
};

class UpdateCheck : public UpdateCheckInterface {
  public:
    UpdateCheck(Poseidon2Interface& poseidon2,
                RangeCheckInterface& range_check,
                HighLevelMerkleDBInterface& merkle_db,
                uint64_t current_timestamp,
                EventEmitterInterface<UpdateCheckEvent>& read_event_emitter)
        : update_check_events(read_event_emitter)
        , poseidon2(poseidon2)
        , range_check(range_check)
        , merkle_db(merkle_db)
        , current_timestamp(current_timestamp)
    {}

    void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) override;

  private:
    EventEmitterInterface<UpdateCheckEvent>& update_check_events;
    Poseidon2Interface& poseidon2;
    RangeCheckInterface& range_check;
    HighLevelMerkleDBInterface& merkle_db;
    uint64_t current_timestamp;
};

} // namespace bb::avm2::simulation
