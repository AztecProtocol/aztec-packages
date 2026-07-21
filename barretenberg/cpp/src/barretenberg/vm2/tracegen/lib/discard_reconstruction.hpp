#pragma once

#include <cassert>
#include <functional>
#include <optional>
#include <stack>
#include <unordered_map>
#include <variant>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Computes a mapping of checkpoint creation indices to the indices where they are reverted.
 *
 * Scans through an event stream containing checkpoint events (CREATE, COMMIT, REVERT) and builds
 * a map identifying which CREATE_CHECKPOINT events are later reverted by REVERT_CHECKPOINT events.
 * This is used to determine which events between a checkpoint creation and its revert should be
 * marked as discarded.
 *
 * The function maintains a stack of checkpoint indices. When a CREATE_CHECKPOINT is encountered,
 * its index is pushed. When a COMMIT_CHECKPOINT is encountered, the top is popped (checkpoint
 * committed successfully). When a REVERT_CHECKPOINT is encountered, the top checkpoint index is
 * recorded in the map before being popped.
 *
 * @tparam EventVariant A std::variant type that includes simulation::CheckPointEventType.
 * @param events The vector of events containing checkpoints and other event types.
 * @return A map from checkpoint creation index to the index where it was reverted.
 */
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
                BB_ASSERT(!checkpoint_stack.empty());
                checkpoint_stack.pop();
                break;
            case simulation::CheckPointEventType::REVERT_CHECKPOINT:
                BB_ASSERT(!checkpoint_stack.empty());
                reverted_in[checkpoint_stack.top()] = i;
                checkpoint_stack.pop();
                break;
            }
        }
    }

    return reverted_in;
}

/**
 * @brief Processes events from a stream, attaching a discard flag to indicate reverted checkpoints.
 *
 * This function iterates through an event stream containing both payload events (e.g., tree operations)
 * and checkpoint management events. For each payload event, it calls the provided callback with the
 * event and a boolean discard flag indicating whether the event belongs to a reverted checkpoint.
 *
 * Events between a CREATE_CHECKPOINT (that will later be reverted) and its corresponding REVERT_CHECKPOINT
 * are marked with discard=true. All other payload events are marked with discard=false.
 *
 * Checkpoint events themselves are consumed by this function and not passed to the callback.
 *
 * @tparam EventType The type of payload events (e.g., IndexedTreeReadWriteEvent).
 * @tparam ProcessEventFn A callable type accepting (const EventType&, bool discard).
 * @param events The vector of events containing both EventType and CheckPointEventType variants.
 * @param process_event The callback function to invoke for each payload event with its discard flag.
 */
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
