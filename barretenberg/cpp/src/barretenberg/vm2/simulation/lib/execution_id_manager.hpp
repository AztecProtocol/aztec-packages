#pragma once

#include <cstdint>

namespace bb::avm2::simulation {

class ExecutionIdGetterInterface {
  public:
    virtual ~ExecutionIdGetterInterface() = default;
    virtual uint32_t get_execution_id() const = 0;
};

class ExecutionIdManagerInterface : public ExecutionIdGetterInterface {
  public:
    virtual ~ExecutionIdManagerInterface() = default;

    virtual void increment_execution_id() = 0;
};

class ExecutionIdManager : public ExecutionIdManagerInterface {
  public:
    ExecutionIdManager(uint32_t initial_execution_id)
        : execution_id_(initial_execution_id)
    {}
    ~ExecutionIdManager() override = default;

    uint32_t get_execution_id() const override { return execution_id_; }
    void increment_execution_id() override { execution_id_++; }

  private:
    uint32_t execution_id_;
};

} // namespace bb::avm2::simulation
