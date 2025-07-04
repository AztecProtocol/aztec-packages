#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include <cstddef>
using namespace bb;

extern "C" int LLVMFuzzerTestOneInput(const unsigned char* Data, size_t Size)
{
    // Create VM with initial step limit
    FieldVM<fq> vm(false, 500);

    // Phase 1: Run for first 500 steps
    size_t bytes_consumed = vm.run(Data, Size);
    if (bytes_consumed == 0) {
        return 0; // Not enough data
    }

    // Check state after first phase
    if (!vm.check_internal_state()) {
        FieldVM<fq> vm_debug(true, 500);
        vm_debug.run(Data, Size);
        assert(false);
        return 1;
    }

    // Export state after first phase
    auto phase1_state = vm.export_uint_state();

    // If VM was stopped due to max steps, continue with more steps
    if (vm.was_stopped_by_max_steps()) {
        // Change step limit and continue execution
        vm.set_max_steps(1000);

        // Continue execution without resetting step counter
        vm.run(Data, Size, false);

        // Check state after second phase
        if (!vm.check_internal_state()) {
            FieldVM<fq> vm_debug(true, 1000);
            vm_debug.run(Data, Size);
            assert(false);
            return 1;
        }

        // Export final state
        auto final_state = vm.export_uint_state();
    }

    return 0;
}