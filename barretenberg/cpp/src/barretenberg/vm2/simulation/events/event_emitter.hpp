#pragma once

#include <list>
#include <vector>

#include "barretenberg/vm2/common/set.hpp"

namespace bb::avm2::simulation {

template <typename Event> class EventEmitterInterface {
  public:
    using Container = std::vector<Event>;

    virtual ~EventEmitterInterface() = default;
    // Pushes the event to the event container.
    virtual void emit(Event&& event) = 0;
    // Transfers ownership of the events to the caller (clears the internal container).
    virtual Container dump_events() = 0;
};

template <typename Event> class EventEmitter : public EventEmitterInterface<Event> {
  public:
    using Container = std::vector<Event>;

    virtual ~EventEmitter() = default;
    void emit(Event&& event) override { events.push_back(std::move(event)); };

    const Container& get_events() const { return events; }
    Container dump_events() override { return std::move(events); }

  private:
    Container events;
};

// This is an EventEmitter that eagerly deduplicates events based on a provided key.
template <typename Event> class DeduplicatingEventEmitter : public EventEmitter<Event> {
  public:
    virtual ~DeduplicatingEventEmitter() = default;

    void emit(Event&& event) override
    {
        typename Event::Key key = event.get_key();
        if (!elements_seen.contains(key)) {
            elements_seen.insert(key);
            EventEmitter<Event>::emit(std::move(event));
        }
    };
    EventEmitter<Event>::Container dump_events() override
    {
        elements_seen.clear();
        return EventEmitter<Event>::dump_events();
    }

  private:
    unordered_flat_set<typename Event::Key> elements_seen;
};

// This is an event emmiter that offers stable references to the events.
// It lets you access the last event that was emitted.
// Note: this is currently unused but it might be needed for the execution trace (calls).
// Reconsider its existence in a while.
template <typename Event> class StableEventEmitter : public EventEmitterInterface<Event> {
  public:
    using Container = std::list<Event>;

    virtual ~StableEventEmitter() = default;
    void emit(Event&& event) override { events.push_back(std::move(event)); };
    Event& last() { return events.back(); }

    const Container& get_events() const { return events; }
    std::vector<Event> dump_events() override
    {
        std::vector<Event> result(events.begin(), events.end());
        events.clear();
        return result;
    }

  private:
    Container events;
};

template <typename Event> class NoopEventEmitter : public EventEmitterInterface<Event> {
  public:
    using Container = std::vector<Event>;

    virtual ~NoopEventEmitter() = default;

    void emit(Event&&) override{};
    Container dump_events() override { return {}; }
};

} // namespace bb::avm2::simulation
