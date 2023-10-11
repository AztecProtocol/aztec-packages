#include "prover_instance.hpp"
#include "barretenberg/honk/proof_system/grand_product_library.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"

namespace proof_system::honk {
/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit
 */
template <class Flavor> void ProverInstance_<Flavor>::compute_circuit_size_parameters(Circuit& circuit)
{
    // Compute total length of the tables and the number of lookup gates; their sum is the minimum circuit size
    for (const auto& table : circuit.lookup_tables) {
        tables_size += table.size;
        lookups_size += table.lookup_gates.size();
    }

    // Get num conventional gates, num public inputs and num Goblin style ECC op gates
    const size_t num_gates = circuit.num_gates;
    num_public_inputs = circuit.public_inputs.size();
    num_ecc_op_gates = 0;
    if constexpr (IsGoblinFlavor<Flavor>) {
        num_ecc_op_gates = circuit.num_ecc_op_gates;
    }

    // minimum circuit size due to the length of lookups plus tables
    const size_t minimum_circuit_size_due_to_lookups = tables_size + lookups_size + num_zero_rows;

    // number of populated rows in the execution trace
    size_t num_rows_populated_in_execution_trace = num_zero_rows + num_ecc_op_gates + num_public_inputs + num_gates;

    // The number of gates is max(lookup gates + tables, rows already populated in trace) + 1, where the +1 is due to
    // addition of a "zero row" at top of the execution trace to ensure wires and other polys are shiftable.
    total_num_gates = std::max(minimum_circuit_size_due_to_lookups, num_rows_populated_in_execution_trace);

    // Next power of 2
    dyadic_circuit_size = circuit.get_circuit_subgroup_size(total_num_gates);
}

/**
 * @brief Compute witness polynomials
 *
 */
template <class Flavor> void ProverInstance_<Flavor>::compute_witness(Circuit& circuit)
{
    if (computed_witness) {
        return;
    }

    // Construct the conventional wire polynomials
    auto wire_polynomials = construct_wire_polynomials_base<Flavor>(circuit, dyadic_circuit_size);

    proving_key->w_l = wire_polynomials[0];
    proving_key->w_r = wire_polynomials[1];
    proving_key->w_o = wire_polynomials[2];
    proving_key->w_4 = wire_polynomials[3];

    // If Goblin, construct the ECC op queue wire polynomials
    if constexpr (IsGoblinFlavor<Flavor>) {
        construct_ecc_op_wire_polynomials(wire_polynomials);
    }

    // Construct the sorted concatenated list polynomials for the lookup argument
    polynomial s_1(dyadic_circuit_size);
    polynomial s_2(dyadic_circuit_size);
    polynomial s_3(dyadic_circuit_size);
    polynomial s_4(dyadic_circuit_size);

    // The sorted list polynomials have (tables_size + lookups_size) populated entries. We define the index below so
    // that these entries are written into the last indices of the polynomials. The values on the first
    // dyadic_circuit_size - (tables_size + lookups_size) indices are automatically initialized to zero via the
    // polynomial constructor.
    size_t s_index = dyadic_circuit_size - tables_size - lookups_size;
    ASSERT(s_index > 0); // We need at least 1 row of zeroes for the permutation argument

    for (auto& table : circuit.lookup_tables) {
        const fr table_index(table.table_index);
        auto& lookup_gates = table.lookup_gates;
        for (size_t i = 0; i < table.size; ++i) {
            if (table.use_twin_keys) {
                lookup_gates.push_back({
                    {
                        table.column_1[i].from_montgomery_form().data[0],
                        table.column_2[i].from_montgomery_form().data[0],
                    },
                    {
                        table.column_3[i],
                        0,
                    },
                });
            } else {
                lookup_gates.push_back({
                    {
                        table.column_1[i].from_montgomery_form().data[0],
                        0,
                    },
                    {
                        table.column_2[i],
                        table.column_3[i],
                    },
                });
            }
        }

#ifdef NO_TBB
        std::sort(lookup_gates.begin(), lookup_gates.end());
#else
        std::sort(std::execution::par_unseq, lookup_gates.begin(), lookup_gates.end());
#endif

        for (const auto& entry : lookup_gates) {
            const auto components = entry.to_sorted_list_components(table.use_twin_keys);
            s_1[s_index] = components[0];
            s_2[s_index] = components[1];
            s_3[s_index] = components[2];
            s_4[s_index] = table_index;
            ++s_index;
        }
    }

    // Polynomial memory is zeroed out when constructed with size hint, so we don't have to initialize trailing
    // space
    proving_key->sorted_1 = s_1;
    proving_key->sorted_2 = s_2;
    proving_key->sorted_3 = s_3;
    proving_key->sorted_4 = s_4;

    // Copy memory read/write record data into proving key. Prover needs to know which gates contain a read/write
    // 'record' witness on the 4th wire. This wire value can only be fully computed once the first 3 wire
    // polynomials have been committed to. The 4th wire on these gates will be a random linear combination of the
    // first 3 wires, using the plookup challenge `eta`. We need to update the records with an offset Because we
    // shift the gates to account for everything that comes before them in the execution trace, e.g. public inputs,
    // a zero row, etc.
    size_t offset = num_ecc_op_gates + num_public_inputs + num_zero_rows;
    auto add_public_inputs_offset = [offset](uint32_t gate_index) { return gate_index + offset; };
    proving_key->memory_read_records = std::vector<uint32_t>();
    proving_key->memory_write_records = std::vector<uint32_t>();

    std::transform(circuit.memory_read_records.begin(),
                   circuit.memory_read_records.end(),
                   std::back_inserter(proving_key->memory_read_records),
                   add_public_inputs_offset);
    std::transform(circuit.memory_write_records.begin(),
                   circuit.memory_write_records.end(),
                   std::back_inserter(proving_key->memory_write_records),
                   add_public_inputs_offset);

    computed_witness = true;
}

/**
 * @brief Construct Goblin style ECC op wire polynomials
 * @details The Ecc op wire values are assumed to have already been stored in the corresponding block of the
 * conventional wire polynomials. The values for the ecc op wire polynomials are set based on those values.
 *
 * @tparam Flavor
 * @param wire_polynomials
 */
template <class Flavor> void ProverInstance_<Flavor>::construct_ecc_op_wire_polynomials(auto& wire_polynomials)
{
    std::array<polynomial, Flavor::NUM_WIRES> op_wire_polynomials;
    for (auto& poly : op_wire_polynomials) {
        poly = static_cast<polynomial>(dyadic_circuit_size);
    }

    // The ECC op wires are constructed to contain the op data on the appropriate range and to vanish everywhere else.
    // The op data is assumed to have already been stored at the correct location in the convetional wires so the data
    // can simply be copied over directly.
    const size_t op_wire_offset = Flavor::has_zero_row ? 1 : 0;
    for (size_t poly_idx = 0; poly_idx < Flavor::NUM_WIRES; ++poly_idx) {
        for (size_t i = 0; i < num_ecc_op_gates; ++i) {
            size_t idx = i + op_wire_offset;
            op_wire_polynomials[poly_idx][idx] = wire_polynomials[poly_idx][idx];
        }
    }

    proving_key->ecc_op_wire_1 = op_wire_polynomials[0];
    proving_key->ecc_op_wire_2 = op_wire_polynomials[1];
    proving_key->ecc_op_wire_3 = op_wire_polynomials[2];
    proving_key->ecc_op_wire_4 = op_wire_polynomials[3];
}

template <class Flavor>
std::shared_ptr<typename Flavor::ProvingKey> ProverInstance_<Flavor>::compute_proving_key(Circuit& circuit)
{
    if (proving_key) {
        return proving_key;
    }

    // Compute lagrange selectors

    proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, num_public_inputs);

    construct_selector_polynomials<Flavor>(circuit, proving_key.get());

    compute_honk_generalized_sigma_permutations<Flavor>(circuit, proving_key.get());

    compute_first_and_last_lagrange_polynomials<Flavor>(proving_key.get());

    polynomial poly_q_table_column_1(dyadic_circuit_size);
    polynomial poly_q_table_column_2(dyadic_circuit_size);
    polynomial poly_q_table_column_3(dyadic_circuit_size);
    polynomial poly_q_table_column_4(dyadic_circuit_size);

    size_t offset = dyadic_circuit_size - tables_size;

    // Create lookup selector polynomials which interpolate each table column.
    // Our selector polys always need to interpolate the full subgroup size, so here we offset so as to
    // put the table column's values at the end. (The first gates are for non-lookup constraints).
    // [0, ..., 0, ...table, 0, 0, 0, x]
    //  ^^^^^^^^^  ^^^^^^^^  ^^^^^^^  ^nonzero to ensure uniqueness and to avoid infinity commitments
    //  |          table     randomness
    //  ignored, as used for regular constraints and padding to the next power of 2.

    for (size_t i = 0; i < offset; ++i) {
        poly_q_table_column_1[i] = 0;
        poly_q_table_column_2[i] = 0;
        poly_q_table_column_3[i] = 0;
        poly_q_table_column_4[i] = 0;
    }

    for (const auto& table : circuit.lookup_tables) {
        const fr table_index(table.table_index);

        for (size_t i = 0; i < table.size; ++i) {
            poly_q_table_column_1[offset] = table.column_1[i];
            poly_q_table_column_2[offset] = table.column_2[i];
            poly_q_table_column_3[offset] = table.column_3[i];
            poly_q_table_column_4[offset] = table_index;
            ++offset;
        }
    }

    // Polynomial memory is zeroed out when constructed with size hint, so we don't have to initialize trailing
    // space

    proving_key->table_1 = poly_q_table_column_1;
    proving_key->table_2 = poly_q_table_column_2;
    proving_key->table_3 = poly_q_table_column_3;
    proving_key->table_4 = poly_q_table_column_4;

    proving_key->recursive_proof_public_input_indices =
        std::vector<uint32_t>(recursive_proof_public_input_indices.begin(), recursive_proof_public_input_indices.end());

    proving_key->contains_recursive_proof = contains_recursive_proof;

    if constexpr (IsGoblinFlavor<Flavor>) {
        proving_key->num_ecc_op_gates = num_ecc_op_gates;
    }

    return proving_key;
}

template <class Flavor> void ProverInstance_<Flavor>::initialise_prover_polynomials()
{
    prover_polynomials.q_c = proving_key->q_c;
    prover_polynomials.q_l = proving_key->q_l;
    prover_polynomials.q_r = proving_key->q_r;
    prover_polynomials.q_o = proving_key->q_o;
    prover_polynomials.q_m = proving_key->q_m;
    prover_polynomials.sigma_1 = proving_key->sigma_1;
    prover_polynomials.sigma_2 = proving_key->sigma_2;
    prover_polynomials.sigma_3 = proving_key->sigma_3;
    prover_polynomials.id_1 = proving_key->id_1;
    prover_polynomials.id_2 = proving_key->id_2;
    prover_polynomials.id_3 = proving_key->id_3;
    prover_polynomials.lagrange_first = proving_key->lagrange_first;
    prover_polynomials.lagrange_last = proving_key->lagrange_last;
    prover_polynomials.w_l = proving_key->w_l;
    prover_polynomials.w_r = proving_key->w_r;
    prover_polynomials.w_o = proving_key->w_o;

    prover_polynomials.q_4 = proving_key->q_4;
    prover_polynomials.q_arith = proving_key->q_arith;
    prover_polynomials.q_sort = proving_key->q_sort;
    prover_polynomials.q_elliptic = proving_key->q_elliptic;
    prover_polynomials.q_aux = proving_key->q_aux;
    prover_polynomials.q_lookup = proving_key->q_lookup;
    prover_polynomials.sigma_4 = proving_key->sigma_4;
    prover_polynomials.id_4 = proving_key->id_4;
    prover_polynomials.table_1 = proving_key->table_1;
    prover_polynomials.table_2 = proving_key->table_2;
    prover_polynomials.table_3 = proving_key->table_3;
    prover_polynomials.table_4 = proving_key->table_4;
    prover_polynomials.table_1_shift = proving_key->table_1.shifted();
    prover_polynomials.table_2_shift = proving_key->table_2.shifted();
    prover_polynomials.table_3_shift = proving_key->table_3.shifted();
    prover_polynomials.table_4_shift = proving_key->table_4.shifted();
    prover_polynomials.w_l_shift = proving_key->w_l.shifted();
    prover_polynomials.w_r_shift = proving_key->w_r.shifted();
    prover_polynomials.w_o_shift = proving_key->w_o.shifted();

    if constexpr (IsGoblinFlavor<Flavor>) {
        prover_polynomials.ecc_op_wire_1 = proving_key->ecc_op_wire_1;
        prover_polynomials.ecc_op_wire_2 = proving_key->ecc_op_wire_2;
        prover_polynomials.ecc_op_wire_3 = proving_key->ecc_op_wire_3;
        prover_polynomials.ecc_op_wire_4 = proving_key->ecc_op_wire_4;
        prover_polynomials.lagrange_ecc_op = proving_key->lagrange_ecc_op;
    }

    std::span<FF> public_wires_source = prover_polynomials.w_r;

    // Determine public input offsets in the circuit relative to the 0th index for Ultra flavors
    pub_inputs_offset = Flavor::has_zero_row ? 1 : 0;
    if constexpr (IsGoblinFlavor<Flavor>) {
        pub_inputs_offset += proving_key->num_ecc_op_gates;
    }
    // Construct the public inputs array
    for (size_t i = 0; i < proving_key->num_public_inputs; ++i) {
        size_t idx = i + pub_inputs_offset;
        public_inputs.emplace_back(public_wires_source[idx]);
    }
}

template <class Flavor> void ProverInstance_<Flavor>::compute_sorted_accumulator_polynomials(FF eta)
{
    relation_parameters.eta = eta;
    // Compute sorted witness-table accumulator
    compute_sorted_list_accumulator(eta);
    prover_polynomials.sorted_accum = proving_key->sorted_accum;
    prover_polynomials.sorted_accum_shift = proving_key->sorted_accum.shifted();

    // Finalize fourth wire polynomial by adding lookup memory records
    add_plookup_memory_records_to_wire_4(eta);
    prover_polynomials.w_4 = proving_key->w_4;
    prover_polynomials.w_4_shift = proving_key->w_4.shifted();
}

/**
 * @brief Construct sorted list accumulator polynomial 's'.
 *
 * @details Compute s = s_1 + η*s_2 + η²*s_3 + η³*s_4 (via Horner) where s_i are the
 * sorted concatenated witness/table polynomials
 *
 * @param key proving key
 * @param sorted_list_polynomials sorted concatenated witness/table polynomials
 * @param eta random challenge
 * @return Polynomial
 */
template <class Flavor> void ProverInstance_<Flavor>::compute_sorted_list_accumulator(FF eta)
{
    const size_t circuit_size = proving_key->circuit_size;

    auto sorted_list_accumulator = Polynomial{ circuit_size };

    auto sorted_polynomials = proving_key->get_sorted_polynomials();

    // Construct s via Horner, i.e. s = s_1 + η(s_2 + η(s_3 + η*s_4))
    for (size_t i = 0; i < circuit_size; ++i) {
        FF T0 = sorted_polynomials[3][i];
        T0 *= eta;
        T0 += sorted_polynomials[2][i];
        T0 *= eta;
        T0 += sorted_polynomials[1][i];
        T0 *= eta;
        T0 += sorted_polynomials[0][i];
        sorted_list_accumulator[i] = T0;
    }
    proving_key->sorted_accum = sorted_list_accumulator;
}

/**
 * @brief Add plookup memory records to the fourth wire polynomial
 *
 * @details This operation must be performed after the first three wires have been committed to, hence the dependence on
 * the `eta` challenge.
 *
 * @tparam Flavor
 * @param eta challenge produced after commitment to first three wire polynomials
 */
template <class Flavor> void ProverInstance_<Flavor>::add_plookup_memory_records_to_wire_4(FF eta)
{
    // The plookup memory record values are computed at the indicated indices as
    // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
    // (See plookup_auxiliary_widget.hpp for details)
    auto wires = proving_key->get_wires();

    // Compute read record values
    for (const auto& gate_idx : proving_key->memory_read_records) {
        wires[3][gate_idx] += wires[2][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[1][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[0][gate_idx];
        wires[3][gate_idx] *= eta;
    }

    // Compute write record values
    for (const auto& gate_idx : proving_key->memory_write_records) {
        wires[3][gate_idx] += wires[2][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[1][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[0][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += 1;
    }
}

template <class Flavor> void ProverInstance_<Flavor>::compute_grand_product_polynomials(FF beta, FF gamma)
{
    auto public_input_delta =
        compute_public_input_delta<Flavor>(public_inputs, beta, gamma, proving_key->circuit_size, pub_inputs_offset);

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;

    auto lookup_grand_product_delta = compute_lookup_grand_product_delta(beta, gamma, proving_key->circuit_size);
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Compute permutation and lookup grand product polynomials
    grand_product_library::compute_grand_products<Flavor>(proving_key, prover_polynomials, relation_parameters);
}

/**
 * Compute verification key consisting of selector precommitments.
 *
 * @return Pointer to the resulting verification key of the Instance.
 * */
template <class Flavor>
std::shared_ptr<typename Flavor::VerificationKey> ProverInstance_<Flavor>::compute_verification_key()
{
    if (verification_key) {
        return verification_key;
    }

    verification_key =
        std::make_shared<typename Flavor::VerificationKey>(proving_key->circuit_size, proving_key->num_public_inputs);

    // Compute and store commitments to all precomputed polynomials
    verification_key->q_m = commitment_key->commit(proving_key->q_m);
    verification_key->q_l = commitment_key->commit(proving_key->q_l);
    verification_key->q_r = commitment_key->commit(proving_key->q_r);
    verification_key->q_o = commitment_key->commit(proving_key->q_o);
    verification_key->q_c = commitment_key->commit(proving_key->q_c);
    verification_key->sigma_1 = commitment_key->commit(proving_key->sigma_1);
    verification_key->sigma_2 = commitment_key->commit(proving_key->sigma_2);
    verification_key->sigma_3 = commitment_key->commit(proving_key->sigma_3);
    verification_key->id_1 = commitment_key->commit(proving_key->id_1);
    verification_key->id_2 = commitment_key->commit(proving_key->id_2);
    verification_key->id_3 = commitment_key->commit(proving_key->id_3);
    verification_key->lagrange_first = commitment_key->commit(proving_key->lagrange_first);
    verification_key->lagrange_last = commitment_key->commit(proving_key->lagrange_last);

    verification_key->q_4 = commitment_key->commit(proving_key->q_4);
    verification_key->q_arith = commitment_key->commit(proving_key->q_arith);
    verification_key->q_sort = commitment_key->commit(proving_key->q_sort);
    verification_key->q_elliptic = commitment_key->commit(proving_key->q_elliptic);
    verification_key->q_aux = commitment_key->commit(proving_key->q_aux);
    verification_key->q_lookup = commitment_key->commit(proving_key->q_lookup);
    verification_key->sigma_4 = commitment_key->commit(proving_key->sigma_4);
    verification_key->id_4 = commitment_key->commit(proving_key->id_4);
    verification_key->table_1 = commitment_key->commit(proving_key->table_1);
    verification_key->table_2 = commitment_key->commit(proving_key->table_2);
    verification_key->table_3 = commitment_key->commit(proving_key->table_3);
    verification_key->table_4 = commitment_key->commit(proving_key->table_4);

    // TODO(luke): Similar to the lagrange_first/last polynomials, we dont really need to commit to this polynomial
    // due to its simple structure. Handling it in the same way as the lagrange polys for now for simplicity.
    if constexpr (IsGoblinFlavor<Flavor>) {
        verification_key->lagrange_ecc_op = commitment_key->commit(proving_key->lagrange_ecc_op);
    }

    // // See `add_recusrive_proof()` for how this recursive data is assigned.
    // verification_key->recursive_proof_public_input_indices =
    //     std::vector<uint32_t>(recursive_proof_public_input_indices.begin(),
    //     recursive_proof_public_input_indices.end());

    // verification_key->contains_recursive_proof = contains_recursive_proof;

    return verification_key;
}

template class ProverInstance_<honk::flavor::Ultra>;
template class ProverInstance_<honk::flavor::UltraGrumpkin>;
template class ProverInstance_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk