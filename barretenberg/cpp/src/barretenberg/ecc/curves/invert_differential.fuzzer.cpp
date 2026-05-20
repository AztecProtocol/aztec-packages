/**
 * @file invert_differential.fuzzer.cpp
 * @brief Differential fuzzer for Bernstein-Yang modular inverse vs Fermat (modexp).
 *
 * Reuses the FieldVM driver from `multi_field.fuzzer.cpp` to generate diverse
 * field elements via sequences of arithmetic operations.  After each VM phase
 * it takes the last element produced (the highest-indexed non-zero slot in the
 * VM's internal state, with a fallback to slot 0) and computes its inverse two
 * different ways:
 *
 *   - A: `pow(modulus_minus_two)` — Fermat's little theorem (modexp).
 *   - B: `bernstein_yang::invert_bernsteinyang19(non_mont, p, p_inv_62)` — variable-time safegcd.
 *
 * Results are compared in canonical (non-Montgomery) form.  Any discrepancy
 * triggers an abort with full diagnostic output (field type, input, both
 * outputs, Montgomery check `a * A ?= 1` and `a * B ?= 1`).
 *
 * Only 254-bit primes are tested (BN254 Fr/Fq, Grumpkin shares the BN254
 * curves), since the 5-limb signed BY state requires p < 2^255 and the
 * production `field::invert()` dispatch also gates on this.  256-bit primes
 * (secp256k1/r1) don't use BY and are skipped.
 */

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/bernstein_yang_inverse.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include <cassert>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

using namespace bb;
using numeric::uint256_t;

// ---------------------------------------------------------------
// Phase header — same 2-byte layout as multi_field.fuzzer.cpp but restricted
// to the two 254-bit fields that actually use BY.
// ---------------------------------------------------------------
enum class FieldType : uint8_t {
    BN254_FQ = 0,
    BN254_FR = 1,
};

static constexpr size_t NUM_FIELD_TYPES = 2;
static constexpr size_t MAX_STEPS = 64;
static constexpr size_t PHASE_HEADER_SIZE = 2;

struct VMPhaseHeader {
    uint8_t field_type;
    uint8_t steps;
};
static_assert(sizeof(VMPhaseHeader) == 2, "VMPhaseHeader must be 2 bytes");

template <typename Field> static uint256_t reduce_to_modulus(const uint256_t& value)
{
    return (value < Field::modulus) ? value : (value % Field::modulus);
}

template <typename Field>
static void import_state_with_reduction(FieldVM<Field>& vm, const std::vector<uint256_t>& state)
{
    for (size_t i = 0; i < INTERNAL_STATE_SIZE && i < state.size(); i++) {
        vm.uint_internal_state[i] = reduce_to_modulus<Field>(state[i]);
        vm.field_internal_state[i] = Field(vm.uint_internal_state[i]);
    }
}

// ---------------------------------------------------------------
// Differential oracle.
//
// Fetches `a_raw` (the non-Montgomery integer) from the VM's uint state and
// computes a^{-1} two ways; aborts on mismatch.
// ---------------------------------------------------------------
template <typename Field> static void differential_check_inverse(const Field& a_mont, const uint256_t& a_raw)
{
    if (a_raw == 0) {
        return; // 0 has no inverse — skip.
    }

    // A: Fermat via pow. We bypass field::invert() (which now dispatches into
    // BY) by calling pow(modulus_minus_two) directly, so both paths are
    // genuinely independent implementations.
    Field fermat_inv = a_mont.pow(Field::modulus_minus_two);

    // B: Bernstein-Yang safegcd, called with the raw (non-Montgomery) value.
    constexpr uint64_t p_inv_62 = bernstein_yang::p_inv_from_r_inv(Field::Params::r_inv);
    constexpr uint256_t p_uint = Field::modulus;
    uint256_t by_inv_raw = bernstein_yang::invert_bernsteinyang19(a_raw, p_uint, p_inv_62);
    // Lift back into Montgomery form so we can compare field values directly.
    Field by_inv{ by_inv_raw.data[0], by_inv_raw.data[1], by_inv_raw.data[2], by_inv_raw.data[3] };
    by_inv.self_to_montgomery_form();

    if (fermat_inv != by_inv) {
        std::fprintf(stderr, "\n[invert_differential.fuzzer] MISMATCH\n");
        std::fprintf(stderr, "  field: %s\n", typeid(Field).name());
        std::fprintf(stderr,
                     "  a_raw = 0x%016lx%016lx%016lx%016lx\n",
                     (unsigned long)a_raw.data[3],
                     (unsigned long)a_raw.data[2],
                     (unsigned long)a_raw.data[1],
                     (unsigned long)a_raw.data[0]);
        uint256_t fa = static_cast<uint256_t>(fermat_inv);
        uint256_t fb = static_cast<uint256_t>(by_inv);
        std::fprintf(stderr,
                     "  fermat = 0x%016lx%016lx%016lx%016lx\n",
                     (unsigned long)fa.data[3],
                     (unsigned long)fa.data[2],
                     (unsigned long)fa.data[1],
                     (unsigned long)fa.data[0]);
        std::fprintf(stderr,
                     "  BY     = 0x%016lx%016lx%016lx%016lx\n",
                     (unsigned long)fb.data[3],
                     (unsigned long)fb.data[2],
                     (unsigned long)fb.data[1],
                     (unsigned long)fb.data[0]);
        uint256_t check_fermat = static_cast<uint256_t>(a_mont * fermat_inv);
        uint256_t check_by = static_cast<uint256_t>(a_mont * by_inv);
        std::fprintf(stderr,
                     "  a * fermat = 0x%016lx%016lx%016lx%016lx  (expect 1)\n",
                     (unsigned long)check_fermat.data[3],
                     (unsigned long)check_fermat.data[2],
                     (unsigned long)check_fermat.data[1],
                     (unsigned long)check_fermat.data[0]);
        std::fprintf(stderr,
                     "  a * BY     = 0x%016lx%016lx%016lx%016lx  (expect 1)\n",
                     (unsigned long)check_by.data[3],
                     (unsigned long)check_by.data[2],
                     (unsigned long)check_by.data[1],
                     (unsigned long)check_by.data[0]);
        std::fflush(stderr);
        std::abort();
    }
}

// Pick the last element produced: highest-indexed non-zero slot of the VM's
// uint state, with a fallback to slot 0 if all slots are zero.
static size_t last_element_index(const std::vector<uint256_t>& state)
{
    for (size_t i = state.size(); i > 0; --i) {
        if (state[i - 1] != uint256_t(0)) {
            return i - 1;
        }
    }
    return 0;
}

template <typename Field>
static int run_phase_and_diff(const VMPhaseHeader& header,
                              const unsigned char* data,
                              size_t size,
                              size_t& data_offset,
                              std::vector<uint256_t>& current_state)
{
    FieldVM<Field> vm(false, header.steps);
    if (!current_state.empty()) {
        import_state_with_reduction<Field>(vm, current_state);
    }
    vm.set_max_steps(header.steps);
    size_t bytes_consumed = vm.run(data + data_offset, size - data_offset, true);
    if (bytes_consumed == 0) {
        return 0;
    }

    if (!vm.check_internal_state()) {
        // Internal VM invariant violation — not the inverse bug we're looking
        // for, but still a failure of the driver.  Report and stop.
        std::fprintf(stderr, "[invert_differential.fuzzer] VM internal state check failed\n");
        return -1;
    }

    // Differential inverse check on the last element produced this phase,
    // plus every non-zero slot in the final state for extra coverage.
    auto uint_state = vm.export_uint_state();
    size_t last_idx = last_element_index(uint_state);
    differential_check_inverse<Field>(vm.field_internal_state[last_idx], uint_state[last_idx]);

    // Extra coverage: also diff every other non-zero slot.  Same check on
    // many more values per phase, virtually free CPU-wise.
    for (size_t i = 0; i < uint_state.size(); ++i) {
        if (i != last_idx && uint_state[i] != uint256_t(0)) {
            differential_check_inverse<Field>(vm.field_internal_state[i], uint_state[i]);
        }
    }

    current_state = uint_state;
    data_offset += bytes_consumed;
    return 1;
}

extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    if (size < PHASE_HEADER_SIZE) {
        return 0;
    }

    std::vector<uint256_t> current_state;
    size_t data_offset = 0;

    while (data_offset + PHASE_HEADER_SIZE <= size) {
        const VMPhaseHeader* header_ptr = reinterpret_cast<const VMPhaseHeader*>(data + data_offset);
        VMPhaseHeader header = *header_ptr;

        FieldType selected_field_type = static_cast<FieldType>(header.field_type % NUM_FIELD_TYPES);
        uint8_t selected_steps = header.steps % MAX_STEPS;
        if (selected_steps == 0) {
            selected_steps = 1;
        }
        header.field_type = static_cast<uint8_t>(selected_field_type);
        header.steps = selected_steps;

        int r = 0;
        switch (selected_field_type) {
        case FieldType::BN254_FQ:
            r = run_phase_and_diff<fq>(header, data, size, data_offset, current_state);
            break;
        case FieldType::BN254_FR:
            r = run_phase_and_diff<fr>(header, data, size, data_offset, current_state);
            break;
        }

        if (r < 0) {
            return 1;
        }
        if (r == 0) {
            break;
        }
    }
    return 0;
}
