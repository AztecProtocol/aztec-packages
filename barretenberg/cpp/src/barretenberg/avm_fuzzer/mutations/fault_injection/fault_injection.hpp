#include "barretenberg/vm2/simulation/events/events_container.hpp"

namespace bb::avm2::fuzzer {

void fault_injection(simulation::EventsContainer& events, std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
