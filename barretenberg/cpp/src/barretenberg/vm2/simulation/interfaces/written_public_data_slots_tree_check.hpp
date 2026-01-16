#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class WrittenPublicDataSlotsInterface {
  public:
    virtual ~WrittenPublicDataSlotsInterface() = default;
    virtual bool contains(const AztecAddress& contract_address, const FF& slot) = 0;
    virtual void insert(const AztecAddress& contract_address, const FF& slot) = 0;
    virtual uint32_t size() const = 0;

    // These are needed since this is a checkpointable set.
    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void revert_checkpoint() = 0;
};

class WrittenPublicDataSlotsTreeCheckInterface : public WrittenPublicDataSlotsInterface {
  public:
    // Abstraction leak: we need to track tree roots to implement the set in-circuit
    virtual AppendOnlyTreeSnapshot get_snapshot() const = 0;
};

} // namespace bb::avm2::simulation
