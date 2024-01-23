#include "proving_key.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"

namespace bb::plonk {

// In all the constructors below, the pippenger_runtime_state takes (n + 1) as the input
// as the degree of t_{high}(X) is (n + 1) for standard plonk. Refer to
// ./src/barretenberg/plonk/proof_system/prover/prover.cpp/ProverBase::compute_quotient_commitments
// for more details on this.
//
// NOTE: If the number of roots cut out of the vanishing polynomial is increased beyond 4,
// the degree of t_{mid}, etc could also increase. Thus, the size of pippenger multi-scalar
// multiplications must be changed accordingly!
//
// After adding blinding to the quotient polynomial parts, the quotient polynomial parts and
// the opening polynomial W_z(X) are all degree-n (i.e. size n + 1).
//
/**
 * proving_key constructor.
 *
 * Delegates to proving_key::init
 * */
proving_key::proving_key(const size_t num_gates,
                         const size_t num_inputs,
                         std::shared_ptr<bb::srs::factories::ProverCrs<curve::BN254>> const& crs,
                         CircuitType type)
    : circuit_type(type)
    , circuit_size(num_gates)
    , log_circuit_size(numeric::get_msb(num_gates))
    , num_public_inputs(num_inputs)
    , small_domain(circuit_size, circuit_size)
    , large_domain(4 * circuit_size, circuit_size > min_thread_block ? circuit_size : 4 * circuit_size)
    , reference_string(crs)
    , polynomial_manifest(type)
{
    init();
}

/**
 * @brief Construct a new proving key from a proving_key_data object
 *
 * @param data
 * @param crs
 */
proving_key::proving_key(proving_key_data&& data,
                         std::shared_ptr<bb::srs::factories::ProverCrs<curve::BN254>> const& crs)
    : circuit_type(static_cast<CircuitType>(data.circuit_type))
    , circuit_size(data.circuit_size)
    , num_public_inputs(data.num_public_inputs)
    , contains_recursive_proof(data.contains_recursive_proof)
    , recursive_proof_public_input_indices(std::move(data.recursive_proof_public_input_indices))
    , memory_read_records(data.memory_read_records)
    , memory_write_records(data.memory_write_records)
    , polynomial_store(data.polynomial_store)
    , small_domain(circuit_size, circuit_size)
    , large_domain(4 * circuit_size, circuit_size > min_thread_block ? circuit_size : 4 * circuit_size)
    , reference_string(crs)
    , polynomial_manifest(static_cast<CircuitType>(data.circuit_type))
{
    init();
}

/**
 * Initialize proving key.
 *
 * 1. Compute lookup tables for small, mid and large domains
 * 2. Set capacity for polynomial store cache
 * 3. Initialize quotient_polynomial_parts(n+1) to zeroes.
 **/
void proving_key::init()
{
    if (circuit_size != 0) {
        small_domain.compute_lookup_table();
        large_domain.compute_lookup_table();
    }

    // t_i for i = 1,2,3 have n+1 coefficients after blinding. t_4 has only n coefficients.
    quotient_polynomial_parts[0] = bb::polynomial(circuit_size + 1);
    quotient_polynomial_parts[1] = bb::polynomial(circuit_size + 1);
    quotient_polynomial_parts[2] = bb::polynomial(circuit_size + 1);
    quotient_polynomial_parts[3] = bb::polynomial(circuit_size);

    memset((void*)&quotient_polynomial_parts[0][0], 0x00, sizeof(bb::fr) * (circuit_size + 1));
    memset((void*)&quotient_polynomial_parts[1][0], 0x00, sizeof(bb::fr) * (circuit_size + 1));
    memset((void*)&quotient_polynomial_parts[2][0], 0x00, sizeof(bb::fr) * (circuit_size + 1));
    memset((void*)&quotient_polynomial_parts[3][0], 0x00, sizeof(bb::fr) * circuit_size);
}

} // namespace bb::plonk
