#pragma once

#include <memory>
#include <stack>

#include "barretenberg/vm2/simulation/context.hpp"

namespace bb::avm2::simulation {

// Manages the stack of contexts.
// Right now it's simple, but I'm pretty sure this will generate its own events (and trace).
class ContextStackInterface {
  public:
    virtual ~ContextStackInterface() = default;

    virtual void push(std::unique_ptr<ContextInterface> context) = 0;
    virtual void pop() = 0;
    virtual ContextInterface& current() = 0;
    virtual bool empty() = 0;
};

class ContextStack : public ContextStackInterface {
  public:
    // TODO: When we push a new context, we'll have to emit an event with the serialized CURRENT top (if any).
    // This would create a row in the subtrace, with the snapshot of the context to come back to once we pop.
    void push(std::unique_ptr<ContextInterface> context) override { stack.push(std::move(context)); }

    void pop() override { stack.pop(); }

    ContextInterface& current() override { return *stack.top(); }
    bool empty() override { return stack.empty(); }

  private:
    std::stack<std::unique_ptr<ContextInterface>> stack;
};

} // namespace bb::avm2::simulation