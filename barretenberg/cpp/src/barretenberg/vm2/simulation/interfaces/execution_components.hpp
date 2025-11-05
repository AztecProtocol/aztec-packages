#pragma once

#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

// FIXME(fcarreiro): Events should not be in the interfaces.
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class ContextInterface;
class AddressingInterface;
class GasTrackerInterface;

class ExecutionComponentsProviderInterface {
  public:
    virtual ~ExecutionComponentsProviderInterface() = default;
    virtual std::unique_ptr<AddressingInterface> make_addressing(AddressingEvent& event) = 0;
    virtual std::unique_ptr<GasTrackerInterface> make_gas_tracker(GasEvent& gas_event,
                                                                  const Instruction& instruction,
                                                                  ContextInterface& context) = 0;
};

} // namespace bb::avm2::simulation
