#pragma once

#include <cassert>
#include <vector>

#include "barretenberg/vm2/common/set.hpp"

namespace bb::avm2::simulation {

template <typename Event> class EventEmitterInterface {
  public:
    using Container = std::vector<Event>;

    virtual ~EventEmitterInterface() = default;
    // Pushes the event to the event container.
    virtual void emit(Event&& event) = 0;
};

template <typename Event> class EventEmitter : public EventEmitterInterface<Event> {
  public:
    using Container = std::vector<Event>;

    virtual ~EventEmitter() = default;
    void emit(Event&& event) override { events.push_back(std::move(event)); };

    const Container& get_events() const { return events; }
    // Transfers ownership of the events to the caller (clears the internal container).
    Container dump_events() { return std::move(events); }

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
    // Transfers ownership of the events to the caller (clears the internal container).
    EventEmitter<Event>::Container dump_events()
    {
        elements_seen.clear();
        return EventEmitter<Event>::dump_events();
    }

  private:
    unordered_flat_set<typename Event::Key> elements_seen;
};

template <typename Event> class NoopEventEmitter : public EventEmitterInterface<Event> {
  public:
    using Container = std::vector<Event>;

    virtual ~NoopEventEmitter() = default;

    void emit(Event&&) override {};
    // TODO: Get rid of this.
    EventEmitter<Event>::Container dump_events() { return {}; };
};

// This is an event emitter which only emits events once (it actually just _sets_ an event).
// This is meant for a special Execution use case.
template <typename Event> class OneShotEventEmitter : public EventEmitterInterface<Event> {
  public:
    OneShotEventEmitter(Event& event)
        : event(event)
    {}
    virtual ~OneShotEventEmitter() = default;
    void emit(Event&& event) override
    {
        assert(!has_emitted);
        has_emitted = true;
        this->event = event;
    }

  private:
    bool has_emitted = false;
    Event& event;
};

} // namespace bb::avm2::simulation
