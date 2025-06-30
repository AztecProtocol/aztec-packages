#pragma once

#include <stack>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/public_data_squash_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/tx_lifecycle_notifiable.hpp"

namespace bb::avm2::simulation {

struct RecordedWrite {
    FF leaf_slot;
    uint32_t execution_id;
};

class PublicDataSquasherInterface {
  public:
    virtual ~PublicDataSquasherInterface() = default;
    virtual void record_write(const FF& leaf_slot, bool is_protocol_write) = 0;
};

class PublicDataSquasher : public PublicDataSquasherInterface,
                           public CheckpointNotifiable,
                           public TransactionLifecycleNotifiable {
  public:
    PublicDataSquasher(RangeCheckInterface& range_check,
                       FieldGreaterThanInterface& field_gt,
                       ExecutionIdGetterInterface& execution_id_manager,
                       EventEmitterInterface<PublicDataSquashEvent>& events)
        : range_check(range_check)
        , field_gt(field_gt)
        , execution_id_manager(execution_id_manager)
        , events(events)
    {}

    void record_write(const FF& leaf_slot, bool is_protocol_write) override;

    void on_checkpoint_created() override;
    void on_checkpoint_committed() override;
    void on_checkpoint_reverted() override;

    void on_simulation_started() override;
    void on_simulation_ended() override;

  private:
    void merge_top_into_parent();

    RangeCheckInterface& range_check;
    FieldGreaterThanInterface& field_gt;
    ExecutionIdGetterInterface& execution_id_manager;
    EventEmitterInterface<PublicDataSquashEvent>& events;

    std::stack<std::vector<RecordedWrite>> writes_stack;
};

} // namespace bb::avm2::simulation
