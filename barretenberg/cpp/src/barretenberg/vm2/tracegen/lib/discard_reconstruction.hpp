#pragma once

#include <cassert>
#include <functional>
#include <optional>
#include <stack>
#include <unordered_map>
#include <variant>
#include <vector>

#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"

namespace bb::avm2::tracegen {

// T is expected to be a std::variant that includes simulation::CheckPointEventType
template <typename EventVariant>
std::unordered_map<size_t, size_t> compute_reverted_in_map(const std::vector<EventVariant>& events)
{
    // Maps the index of the checkpoint to the index it was reverted in.
    std::unordered_map<size_t, size_t> reverted_in;

    std::stack<size_t> checkpoint_stack;

    // We need to reconstruct discard in this trace using checkpointing events.
    // https://hackmd.io/luYtD3XVTpGCDFeeCYS_Uw?view#Discard-reconstruction
    // Find all the reverts and record which checkpoint is being reverted.
    for (size_t i = 0; i < events.size(); i++) {
        const auto& event = events.at(i);

        if (std::holds_alternative<simulation::CheckPointEventType>(event)) {
            switch (std::get<simulation::CheckPointEventType>(event)) {
            case simulation::CheckPointEventType::CREATE_CHECKPOINT:
                checkpoint_stack.push(i);
                break;
            case simulation::CheckPointEventType::COMMIT_CHECKPOINT:
                assert(!checkpoint_stack.empty());
                checkpoint_stack.pop();
                break;
            case simulation::CheckPointEventType::REVERT_CHECKPOINT:
                assert(!checkpoint_stack.empty());
                reverted_in[checkpoint_stack.top()] = i;
                checkpoint_stack.pop();
                break;
            }
        }
    }

    return reverted_in;
}

template <typename EventType, typename ProcessEventFn>
void process_with_discard(const std::vector<std::variant<EventType, simulation::CheckPointEventType>>& events,
                          ProcessEventFn&& process_event)
{
    auto reverted_in = compute_reverted_in_map(events);
    bool discard = false;
    std::optional<size_t> waiting_for_revert = std::nullopt;

    for (size_t i = 0; i < events.size(); i++) {
        const auto& event = events.at(i);
        if (std::holds_alternative<simulation::CheckPointEventType>(event)) {
            auto check_point_event = std::get<simulation::CheckPointEventType>(event);
            if (check_point_event == simulation::CheckPointEventType::CREATE_CHECKPOINT && reverted_in.contains(i) &&
                !waiting_for_revert.has_value()) {
                // This checkpoint will revert in the future: discard all events until the revert.
                waiting_for_revert = reverted_in.at(i);
                discard = true;
            } else if (check_point_event == simulation::CheckPointEventType::REVERT_CHECKPOINT &&
                       waiting_for_revert.has_value() && waiting_for_revert.value() == i) {
                // We found the revert we were waiting for: stop discarding events.
                // Note that we ensure that we find exactly the revert we were waiting for and ignore any nested
                // reverts.
                waiting_for_revert = std::nullopt;
                discard = false;
            }
        } else {
            const auto& payload_event = std::get<EventType>(event);
            process_event(payload_event, discard);
        }
    }
}

} // namespace bb::avm2::tracegen
