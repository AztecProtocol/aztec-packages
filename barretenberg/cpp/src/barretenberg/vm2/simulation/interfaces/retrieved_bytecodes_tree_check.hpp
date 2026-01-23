#pragma once

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class RetrievedBytecodesInterface {
  public:
    virtual ~RetrievedBytecodesInterface() = default;
    virtual bool contains(const FF& class_id) = 0;
    virtual void insert(const FF& class_id) = 0;
    virtual uint32_t size() const = 0;
};

class RetrievedBytecodesTreeCheckInterface : public RetrievedBytecodesInterface {
  public:
    // Abstraction leak: we need to track tree roots to implement the set in-circuit
    virtual AppendOnlyTreeSnapshot get_snapshot() const = 0;
};

} // namespace bb::avm2::simulation
