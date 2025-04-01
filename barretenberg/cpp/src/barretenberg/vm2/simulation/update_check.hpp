#pragma once

#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class UpdateCheckInterface {
  public:
    virtual ~UpdateCheckInterface() = default;
    virtual void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) = 0;
};

class UpdateCheck : public UpdateCheckInterface {
  public:
    UpdateCheck(Poseidon2Interface& poseidon2,
                HighLevelMerkleDBInterface& merkle_db,
                uint32_t block_number,
                EventEmitterInterface<UpdateCheckEvent>& read_event_emitter)
        : update_check_events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_db(merkle_db)
        , block_number(block_number)
    {}

    void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) override;

  private:
    EventEmitterInterface<UpdateCheckEvent>& update_check_events;
    Poseidon2Interface& poseidon2;
    HighLevelMerkleDBInterface& merkle_db;
    uint32_t block_number;
};

} // namespace bb::avm2::simulation
