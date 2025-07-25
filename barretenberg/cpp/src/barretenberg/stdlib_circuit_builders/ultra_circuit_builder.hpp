// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/honk/execution_trace/ultra_execution_trace.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/honk/types/merkle_hash_type.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

// TODO(md): note that this has now been added
#include "circuit_builder_base.hpp"
#include "rom_ram_logic.hpp"
#include <optional>
#include <unordered_set>

#include "barretenberg/serialize/msgpack.hpp"

namespace bb {

template <typename FF> struct non_native_multiplication_witnesses {
    // first 4 array elements = limbs
    std::array<uint32_t, 4> a;
    std::array<uint32_t, 4> b;
    std::array<uint32_t, 4> q;
    std::array<uint32_t, 4> r;
    std::array<FF, 4> neg_modulus;
};

template <typename FF> struct non_native_partial_multiplication_witnesses {
    // first 4 array elements = limbs
    std::array<uint32_t, 4> a;
    std::array<uint32_t, 4> b;
};

template <typename ExecutionTrace_>
class UltraCircuitBuilder_ : public CircuitBuilderBase<typename ExecutionTrace_::FF> {
  public:
    using ExecutionTrace = ExecutionTrace_;
    using FF = typename ExecutionTrace::FF;
    using RomRamLogic = RomRamLogic_<ExecutionTrace>;

    static constexpr size_t NUM_WIRES = ExecutionTrace::NUM_WIRES;
    // Keeping NUM_WIRES, at least temporarily, for backward compatibility
    static constexpr size_t program_width = ExecutionTrace::NUM_WIRES;
    static constexpr size_t num_selectors = ExecutionTrace::NUM_SELECTORS;

    static constexpr std::string_view NAME_STRING = "UltraCircuitBuilder";
    static constexpr CircuitType CIRCUIT_TYPE = CircuitType::ULTRA;
    static constexpr merkle::HashType merkle_hash_type = merkle::HashType::LOOKUP_PEDERSEN;
    static constexpr size_t UINT_LOG2_BASE = 6; // DOCTODO: explain what this is, or rename.
    // The plookup range proof requires work linear in range size, thus cannot be used directly for
    // large ranges such as 2^64. For such ranges the element will be decomposed into smaller
    // chuncks according to the parameter below
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_BITNUM = 14;
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_STEP_SIZE = 3;
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_SIZE = (1 << DEFAULT_PLOOKUP_RANGE_BITNUM) - 1;
    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = 68;
    static constexpr uint32_t UNINITIALIZED_MEMORY_RECORD = UINT32_MAX;
    static constexpr size_t NUMBER_OF_GATES_PER_RAM_ACCESS = 2;
    static constexpr size_t NUMBER_OF_ARITHMETIC_GATES_PER_RAM_ARRAY = 1;
    // number of gates created per non-native field operation in process_non_native_field_multiplications
    static constexpr size_t GATES_PER_NON_NATIVE_FIELD_MULTIPLICATION_ARITHMETIC = 7;

    enum MEMORY_SELECTORS {
        MEM_NONE,
        RAM_CONSISTENCY_CHECK,
        ROM_CONSISTENCY_CHECK,
        RAM_TIMESTAMP_CHECK,
        ROM_READ,
        RAM_READ,
        RAM_WRITE,
    };

    enum NNF_SELECTORS {
        NNF_NONE,
        LIMB_ACCUMULATE_1,
        LIMB_ACCUMULATE_2,
        NON_NATIVE_FIELD_1,
        NON_NATIVE_FIELD_2,
        NON_NATIVE_FIELD_3,
    };

    struct RangeList {
        uint64_t target_range;
        uint32_t range_tag;
        uint32_t tau_tag;
        std::vector<uint32_t> variable_indices;
        bool operator==(const RangeList& other) const noexcept
        {
            return target_range == other.target_range && range_tag == other.range_tag && tau_tag == other.tau_tag &&
                   variable_indices == other.variable_indices;
        }
    };

    /**
     * @brief Used to store instructions to create partial_non_native_field_multiplication gates.
     *        We want to cache these (and remove duplicates) as the stdlib code can end up multiplying the same inputs
     * repeatedly.
     */
    struct cached_partial_non_native_field_multiplication {
        std::array<uint32_t, 4> a;
        std::array<uint32_t, 4> b;
        uint32_t lo_0;
        uint32_t hi_0;
        uint32_t hi_1;

        bool operator==(const cached_partial_non_native_field_multiplication& other) const
        {
            bool valid = true;
            for (size_t i = 0; i < 4; ++i) {
                valid = valid && (a[i] == other.a[i]);
                valid = valid && (b[i] == other.b[i]);
            }
            return valid;
        }

        /**
         * @brief Dedupilcate cache entries which represent multiplication of the same witnesses
         *
         * @details While a and b witness vectors are the same, lo_0, hi_0 and hi_1 can vary, so we have to connect them
         * or there is a vulnerability
         *
         * @param vec
         * @param circuit_builder
         */
        static void deduplicate(std::vector<cached_partial_non_native_field_multiplication>& vec,
                                UltraCircuitBuilder_<ExecutionTrace>* circuit_builder)
        {
            std::unordered_set<cached_partial_non_native_field_multiplication, Hash, std::equal_to<>> seen;

            std::vector<cached_partial_non_native_field_multiplication> uniqueVec;

            for (const auto& item : vec) {
                auto [existing_element, not_in_set] = seen.insert(item);
                // Memorize if not in set yet
                if (not_in_set) {
                    uniqueVec.push_back(item);
                } else {
                    // If we already have a representative, we need to connect the outputs together
                    circuit_builder->assert_equal(item.lo_0, (*existing_element).lo_0);
                    circuit_builder->assert_equal(item.hi_0, (*existing_element).hi_0);
                    circuit_builder->assert_equal(item.hi_1, (*existing_element).hi_1);
                }
            }

            vec.swap(uniqueVec);
        }

        bool operator<(const cached_partial_non_native_field_multiplication& other) const
        {
            if (a < other.a) {
                return true;
            }
            if (other.a < a) {
                return false;
            }
            if (b < other.b) {
                return true;
            }
            return other.b < b;
        }

        struct Hash {
            size_t operator()(const cached_partial_non_native_field_multiplication& obj) const
            {
                size_t combined_hash = 0;

                // C++ does not have a standard way to hash values, so we use the
                // common algorithm that boot uses.
                // You can search for 'cpp hash_combine' to find more information.
                // Here is one reference:
                // https://stackoverflow.com/questions/2590677/how-do-i-combine-hash-values-in-c0x
                auto hash_combiner = [](size_t lhs, size_t rhs) {
                    return lhs ^ (rhs + 0x9e3779b9 + (lhs << 6) + (lhs >> 2));
                };

                for (const auto& elem : obj.a) {
                    combined_hash = hash_combiner(combined_hash, std::hash<uint32_t>()(elem));
                }
                for (const auto& elem : obj.b) {
                    combined_hash = hash_combiner(combined_hash, std::hash<uint32_t>()(elem));
                }

                return combined_hash;
            }
        };
    };

    struct non_native_field_multiplication_cross_terms {
        uint32_t lo_0_idx;
        uint32_t lo_1_idx;
        uint32_t hi_0_idx;
        uint32_t hi_1_idx;
        uint32_t hi_2_idx;
        uint32_t hi_3_idx;
    };

    // Storage for wires and selectors for all gate types
    ExecutionTrace blocks;

    // These are variables that we have used a gate on, to enforce that they are
    // equal to a defined value.
    std::map<FF, uint32_t> constant_variable_indices;

    // The set of lookup tables used by the circuit, plus the gate data for the lookups from each table
    std::vector<plookup::BasicTable> lookup_tables;

    // Rom/Ram logic
    RomRamLogic rom_ram_logic = RomRamLogic();

    // Stores gate index of ROM/RAM reads (required by proving key)
    std::vector<uint32_t> memory_read_records;
    // Stores gate index of RAM writes (required by proving key)
    std::vector<uint32_t> memory_write_records;
    std::map<uint64_t, RangeList> range_lists; // DOCTODO: explain this.

    // Witnesses that can be in one gate, but that's intentional (used in boomerang catcher)
    std::vector<uint32_t> used_witnesses;
    std::vector<cached_partial_non_native_field_multiplication> cached_partial_non_native_field_multiplications;

    bool circuit_finalized = false;

    std::vector<fr> ipa_proof;

    void populate_public_inputs_block();

    void process_non_native_field_multiplications();
    UltraCircuitBuilder_(const size_t size_hint = 0)
        : CircuitBuilderBase<FF>(size_hint)
    {
        this->zero_idx = put_constant_variable(FF::zero());
        this->tau.insert({ DUMMY_TAG, DUMMY_TAG }); // TODO(luke): explain this
    };
    /**
     * @brief Constructor from data generated from ACIR
     *
     * @param size_hint
     * @param witness_values witnesses values known to acir
     * @param public_inputs indices of public inputs in witness array
     * @param varnum number of known witness
     *
     * @note The size of witness_values may be less than varnum. The former is the set of actual witness values known at
     * the time of acir generation. The latter may be larger and essentially acounts for placeholders for witnesses that
     * we know will exist but whose values are not known during acir generation. Both are in general less than the total
     * number of variables/witnesses that might be present for a circuit generated from acir, since many gates will
     * depend on the details of the bberg implementation (or more generally on the backend used to process acir).
     */
    UltraCircuitBuilder_(const size_t size_hint,
                         auto& witness_values,
                         const std::vector<uint32_t>& public_inputs,
                         size_t varnum,
                         bool recursive = false)
        : CircuitBuilderBase<FF>(size_hint, witness_values.empty())
    {
        for (size_t idx = 0; idx < varnum; ++idx) {
            // Zeros are added for variables whose existence is known but whose values are not yet known. The values may
            // be "set" later on via the assert_equal mechanism.
            auto value = idx < witness_values.size() ? witness_values[idx] : 0;
            this->add_variable(value);
        }

        // Initialize the builder public_inputs directly from the acir public inputs.
        this->initialize_public_inputs(public_inputs);

        // Add the const zero variable after the acir witness has been
        // incorporated into variables.
        this->zero_idx = put_constant_variable(FF::zero());
        this->tau.insert({ DUMMY_TAG, DUMMY_TAG }); // TODO(luke): explain this

        this->is_recursive_circuit = recursive;
    };
    UltraCircuitBuilder_(const UltraCircuitBuilder_& other) = default;
    UltraCircuitBuilder_(UltraCircuitBuilder_&& other) noexcept
        : CircuitBuilderBase<FF>(std::move(other))
        , blocks(other.blocks)
        , constant_variable_indices(other.constant_variable_indices)
        , lookup_tables(other.lookup_tables)
        , rom_ram_logic(other.rom_ram_logic)
        , memory_read_records(other.memory_read_records)
        , memory_write_records(other.memory_write_records)
        , range_lists(other.range_lists)
        , cached_partial_non_native_field_multiplications(other.cached_partial_non_native_field_multiplications)
        , circuit_finalized(other.circuit_finalized)
        , ipa_proof(other.ipa_proof){};
    UltraCircuitBuilder_& operator=(const UltraCircuitBuilder_& other) = default;
    UltraCircuitBuilder_& operator=(UltraCircuitBuilder_&& other) noexcept
    {
        CircuitBuilderBase<FF>::operator=(std::move(other));
        blocks = other.blocks;
        constant_variable_indices = other.constant_variable_indices;

        lookup_tables = other.lookup_tables;
        range_lists = other.range_lists;
        rom_ram_logic = other.rom_ram_logic;
        memory_read_records = other.memory_read_records;
        memory_write_records = other.memory_write_records;
        cached_partial_non_native_field_multiplications = other.cached_partial_non_native_field_multiplications;
        circuit_finalized = other.circuit_finalized;
        ipa_proof = other.ipa_proof;
        return *this;
    };
    ~UltraCircuitBuilder_() override = default;

    bool operator==(const UltraCircuitBuilder_& other) const
    {

        return blocks == other.blocks && constant_variable_indices == other.constant_variable_indices &&
               lookup_tables == other.lookup_tables && memory_read_records == other.memory_read_records &&
               memory_write_records == other.memory_write_records && range_lists == other.range_lists &&
               cached_partial_non_native_field_multiplications ==
                   other.cached_partial_non_native_field_multiplications &&
               used_witnesses == other.used_witnesses && rom_ram_logic == other.rom_ram_logic &&
               // Compare the base class
               CircuitBuilderBase<FF>::operator==(other);
    }
    /**
     * @brief Debug helper method for ensuring all selectors have the same size
     * @details Each gate construction method manually appends values to the selectors. Failing to update one of the
     * selectors will lead to an unsatisfiable circuit. This method provides a mechanism for ensuring that each selector
     * has been updated as expected. Its logic is only active in debug mode.
     *
     */
    void check_selector_length_consistency()
    {
#if NDEBUG
        // do nothing
#else
        for (auto& block : blocks.get()) {
            size_t nominal_size = block.selectors[0].size();
            for (size_t idx = 1; idx < block.selectors.size(); ++idx) {
                ASSERT_DEBUG(block.selectors[idx].size() == nominal_size);
            }
        }

#endif // NDEBUG
    }

    void finalize_circuit(const bool ensure_nonzero);

    void add_gates_to_ensure_all_polys_are_non_zero();

    void create_add_gate(const add_triple_<FF>& in) override;
    void create_big_mul_add_gate(const mul_quad_<FF>& in, const bool use_next_gate_w_4 = false);
    void create_big_add_gate(const add_quad_<FF>& in, const bool use_next_gate_w_4 = false);
    void create_big_add_gate_with_bit_extraction(const add_quad_<FF>& in);
    void create_big_mul_gate(const mul_quad_<FF>& in);
    void create_balanced_add_gate(const add_quad_<FF>& in);

    void create_mul_gate(const mul_triple_<FF>& in) override;
    void create_bool_gate(const uint32_t a) override;
    void create_poly_gate(const poly_triple_<FF>& in) override;
    void create_ecc_add_gate(const ecc_add_gate_<FF>& in);
    void create_ecc_dbl_gate(const ecc_dbl_gate_<FF>& in);

    void fix_witness(const uint32_t witness_index, const FF& witness_value);

    void create_new_range_constraint(const uint32_t variable_index,
                                     const uint64_t target_range,
                                     std::string const msg = "create_new_range_constraint");
    void create_range_constraint(const uint32_t variable_index, const size_t num_bits, std::string const& msg)
    {
        if (num_bits == 1) {
            create_bool_gate(variable_index);
        } else if (num_bits <= DEFAULT_PLOOKUP_RANGE_BITNUM) {
            /**
             * N.B. if `variable_index` is not used in any arithmetic constraints, this will create an unsatisfiable
             *      circuit!
             *      this range constraint will increase the size of the 'sorted set' of range-constrained integers by 1.
             *      The 'non-sorted set' of range-constrained integers is a subset of the wire indices of all arithmetic
             *      gates. No arithmetic gate => size imbalance between sorted and non-sorted sets. Checking for this
             *      and throwing an error would require a refactor of the Composer to catelog all 'orphan' variables not
             *      assigned to gates.
             *
             * TODO(Suyash):
             *    The following is a temporary fix to make sure the range constraints on numbers with
             *    num_bits <= DEFAULT_PLOOKUP_RANGE_BITNUM is correctly enforced in the circuit.
             *    Longer term, as Zac says, we would need to refactor the composer to fix this.
             **/
            create_poly_gate(poly_triple_<FF>{
                .a = variable_index,
                .b = variable_index,
                .c = variable_index,
                .q_m = 0,
                .q_l = 1,
                .q_r = -1,
                .q_o = 0,
                .q_c = 0,
            });
            create_new_range_constraint(variable_index, (1ULL << num_bits) - 1, msg);
        } else {
            decompose_into_default_range(variable_index, num_bits, DEFAULT_PLOOKUP_RANGE_BITNUM, msg);
        }
    }

    accumulator_triple_<FF> create_logic_constraint(const uint32_t a,
                                                    const uint32_t b,
                                                    const size_t num_bits,
                                                    bool is_xor_gate);
    accumulator_triple_<FF> create_and_constraint(const uint32_t a, const uint32_t b, const size_t num_bits);
    accumulator_triple_<FF> create_xor_constraint(const uint32_t a, const uint32_t b, const size_t num_bits);

    uint32_t put_constant_variable(const FF& variable);

    size_t get_num_constant_gates() const override { return 0; }
    /**
     * @brief Get the final number of gates in a circuit, which consists of the sum of:
     * 1) Current number number of actual gates
     * 2) Number of public inputs, as we'll need to add a gate for each of them
     * 3) Number of Rom array-associated gates
     * 4) Number of range-list associated gates
     * 5) Number of non-native field multiplication gates.
     *
     *
     * @param count return arument, number of existing gates
     * @param rangecount return argument, extra gates due to range checks
     * @param romcount return argument, extra gates due to rom reads
     * @param ramcount return argument, extra gates due to ram read/writes
     * @param nnfcount return argument, extra gates due to queued non native field gates
     */
    void get_num_estimated_gates_split_into_components(
        size_t& count, size_t& rangecount, size_t& romcount, size_t& ramcount, size_t& nnfcount) const
    {
        count = this->num_gates;

        // each ROM gate adds +1 extra gate due to the rom reads being copied to a sorted list set
        for (size_t i = 0; i < rom_ram_logic.rom_arrays.size(); ++i) {
            for (size_t j = 0; j < rom_ram_logic.rom_arrays[i].state.size(); ++j) {
                if (rom_ram_logic.rom_arrays[i].state[j][0] == UNINITIALIZED_MEMORY_RECORD) {
                    romcount += 2;
                }
            }
            romcount += (rom_ram_logic.rom_arrays[i].records.size());
            romcount += 1; // we add an addition gate after procesing a rom array
        }

        // each RAM gate adds +2 extra gates due to the ram reads being copied to a sorted list set,
        // as well as an extra gate to validate timestamps
        std::vector<size_t> ram_timestamps;
        std::vector<size_t> ram_range_sizes;
        std::vector<size_t> ram_range_exists;
        for (size_t i = 0; i < rom_ram_logic.ram_arrays.size(); ++i) {
            for (size_t j = 0; j < rom_ram_logic.ram_arrays[i].state.size(); ++j) {
                if (rom_ram_logic.ram_arrays[i].state[j] == UNINITIALIZED_MEMORY_RECORD) {
                    ramcount += NUMBER_OF_GATES_PER_RAM_ACCESS;
                }
            }
            ramcount += (rom_ram_logic.ram_arrays[i].records.size() * NUMBER_OF_GATES_PER_RAM_ACCESS);
            ramcount += NUMBER_OF_ARITHMETIC_GATES_PER_RAM_ARRAY; // we add an addition gate after procesing a ram array

            // there will be 'max_timestamp' number of range checks, need to calculate.
            const auto max_timestamp = rom_ram_logic.ram_arrays[i].access_count - 1;

            // if a range check of length `max_timestamp` already exists, we are double counting.
            // We record `ram_timestamps` to detect and correct for this error when we process range lists.

            ram_timestamps.push_back(max_timestamp);
            size_t padding = (NUM_WIRES - (max_timestamp % NUM_WIRES)) % NUM_WIRES;
            if (max_timestamp == NUM_WIRES) {
                padding += NUM_WIRES;
            }
            const size_t ram_range_check_list_size = max_timestamp + padding;

            size_t ram_range_check_gate_count = (ram_range_check_list_size / NUM_WIRES);
            ram_range_check_gate_count += 1; // we need to add 1 extra addition gates for every distinct range list

            ram_range_sizes.push_back(ram_range_check_gate_count);
            ram_range_exists.push_back(false);
        }
        for (const auto& list : range_lists) {
            auto list_size = list.second.variable_indices.size();
            size_t padding = (NUM_WIRES - (list.second.variable_indices.size() % NUM_WIRES)) % NUM_WIRES;
            if (list.second.variable_indices.size() == NUM_WIRES) {
                padding += NUM_WIRES;
            }
            list_size += padding;

            for (size_t i = 0; i < ram_timestamps.size(); ++i) {
                if (list.second.target_range == ram_timestamps[i]) {
                    ram_range_exists[i] = true;
                }
            }
            rangecount += (list_size / NUM_WIRES);
            rangecount += 1; // we need to add 1 extra addition gates for every distinct range list
        }
        // update rangecount to include the ram range checks the composer will eventually be creating
        for (size_t i = 0; i < ram_range_sizes.size(); ++i) {
            if (!ram_range_exists[i]) {
                rangecount += ram_range_sizes[i];
            }
        }
        std::vector<cached_partial_non_native_field_multiplication> nnf_copy(
            cached_partial_non_native_field_multiplications);
        // update nnfcount
        std::sort(nnf_copy.begin(), nnf_copy.end());

        auto last = std::unique(nnf_copy.begin(), nnf_copy.end());
        const size_t num_nnf_ops = static_cast<size_t>(std::distance(nnf_copy.begin(), last));
        nnfcount = num_nnf_ops * GATES_PER_NON_NATIVE_FIELD_MULTIPLICATION_ARITHMETIC;
    }

    /**
     * @brief Get the number of gates in a finalized circuit.
     * @return size_t
     */
    size_t get_num_finalized_gates() const override
    {
        ASSERT(circuit_finalized);
        return this->num_gates;
    }

    /**
     * @brief Get the final number of gates in a circuit, which consists of the sum of:
     * 1) Current number number of actual gates
     * 2) Number of public inputs, as we'll need to add a gate for each of them
     * 3) Number of Rom array-associated gates
     * 4) Number of range-list associated gates
     * 5) Number of non-native field multiplication gates.
     * !!! WARNING: This function is predictive and might report an incorrect number. Make sure to finalise the circuit
     * and then check the number of gates for a precise result. Kesha: it's basically voodoo
     *
     * @return size_t
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/875): This method may return an incorrect value before
     * the circuit is finalized due to a failure to account for "de-duplication" when computing how many
     * non-native-field gates will be present.
     */
    size_t get_estimated_num_finalized_gates() const override
    {
        // if circuit finalized already added extra gates
        if (circuit_finalized) {
            return this->num_gates;
        }
        size_t count = 0;
        size_t rangecount = 0;
        size_t romcount = 0;
        size_t ramcount = 0;
        size_t nnfcount = 0;
        get_num_estimated_gates_split_into_components(count, rangecount, romcount, ramcount, nnfcount);
        return count + romcount + ramcount + rangecount + nnfcount;
    }

    /**
     * @brief Dynamically compute the number of gates added by the "add_gates_to_ensure_all_polys_are_non_zero" method
     * @note This does NOT add the gates to the present builder
     *
     */
    size_t get_num_gates_added_to_ensure_nonzero_polynomials()
    {
        UltraCircuitBuilder_<ExecutionTrace> builder; // instantiate new builder

        size_t num_gates_prior = builder.get_estimated_num_finalized_gates();
        builder.add_gates_to_ensure_all_polys_are_non_zero();
        size_t num_gates_post = builder.get_estimated_num_finalized_gates(); // accounts for finalization gates

        return num_gates_post - num_gates_prior;
    }

    /**
     * @brief Get combined size of all tables used in circuit
     *
     */
    size_t get_tables_size() const
    {
        size_t tables_size = 0;
        for (const auto& table : lookup_tables) {
            tables_size += table.size();
        }
        return tables_size;
    }

    /**
     * @brief Get total number of lookups used in circuit
     *
     */
    size_t get_lookups_size() const
    {
        size_t lookups_size = 0;
        for (const auto& table : lookup_tables) {
            lookups_size += table.lookup_gates.size();
        }
        return lookups_size;
    }

    /**
     * @brief Get the actual finalized size of a circuit. Assumes the circuit is finalized already.
     *
     * @details This method calculates the size of the circuit without rounding up to the next power of 2. It takes into
     * account the possibility that the tables will dominate the size and checks both the plookup argument
     * size and the general circuit size
     *
     * @return size_t
     */
    size_t get_finalized_total_circuit_size() const
    {
        ASSERT(circuit_finalized);
        auto num_filled_gates = get_num_finalized_gates() + this->num_public_inputs();
        return std::max(get_tables_size(), num_filled_gates);
    }

    /**
     * @brief Get the estimated size of the circuit if it was finalized now
     *
     * @details This method estimates the size of the circuit without rounding up to the next power of 2. It takes into
     * account the possibility that the tables will dominate the size and checks both the estimated plookup argument
     * size and the general circuit size
     *
     * @return size_t
     */
    size_t get_estimated_total_circuit_size() const
    {
        auto num_filled_gates = get_estimated_num_finalized_gates() + this->num_public_inputs();
        return std::max(get_tables_size(), num_filled_gates);
    }

    std::vector<uint32_t> get_used_witnesses() const { return used_witnesses; }

    void update_used_witnesses(uint32_t var_idx) { used_witnesses.emplace_back(var_idx); }

    /**x
     * @brief Print the number and composition of gates in the circuit
     *
     */
    void print_num_estimated_finalized_gates() const override
    {
        size_t count = 0;
        size_t rangecount = 0;
        size_t romcount = 0;
        size_t ramcount = 0;
        size_t nnfcount = 0;
        get_num_estimated_gates_split_into_components(count, rangecount, romcount, ramcount, nnfcount);

        size_t total = count + romcount + ramcount + rangecount;
        std::cout << "gates = " << total << " (arith " << count << ", rom " << romcount << ", ram " << ramcount
                  << ", range " << rangecount << ", non native field gates " << nnfcount
                  << "), pubinp = " << this->num_public_inputs() << std::endl;
    }

    void assert_equal_constant(const uint32_t a_idx, const FF& b, std::string const& msg = "assert equal constant")
    {
        if (this->get_variable(a_idx) != b && !this->failed()) {
            this->failure(msg);
        }
        auto b_idx = put_constant_variable(b);
        this->assert_equal(a_idx, b_idx, msg);
    }

    /**
     * Plookup Methods
     **/
    void initialize_precomputed_table(const plookup::BasicTableId id,
                                      bool (*generator)(std::vector<FF>&, std::vector<FF>&, std::vector<FF>&),
                                      std::array<FF, 2> (*get_values_from_key)(const std::array<uint64_t, 2>));

    plookup::BasicTable& get_table(const plookup::BasicTableId id);
    plookup::MultiTable& get_multitable(const plookup::MultiTableId id);

    plookup::ReadData<uint32_t> create_gates_from_plookup_accumulators(
        const plookup::MultiTableId& id,
        const plookup::ReadData<FF>& read_values,
        const uint32_t key_a_index,
        std::optional<uint32_t> key_b_index = std::nullopt);

    /**
     * Generalized Permutation Methods
     **/
    std::vector<uint32_t> decompose_into_default_range(
        const uint32_t variable_index,
        const uint64_t num_bits,
        const uint64_t target_range_bitnum = DEFAULT_PLOOKUP_RANGE_BITNUM,
        std::string const& msg = "decompose_into_default_range");
    std::vector<uint32_t> decompose_into_default_range_better_for_oddlimbnum(
        const uint32_t variable_index,
        const size_t num_bits,
        std::string const& msg = "decompose_into_default_range_better_for_oddlimbnum");
    void create_dummy_gate(auto& block, const uint32_t&, const uint32_t&, const uint32_t&, const uint32_t&);
    void create_dummy_constraints(const std::vector<uint32_t>& variable_index);
    void create_sort_constraint(const std::vector<uint32_t>& variable_index);
    void create_sort_constraint_with_edges(const std::vector<uint32_t>& variable_index, const FF&, const FF&);
    void assign_tag(const uint32_t variable_index, const uint32_t tag)
    {
        BB_ASSERT_LTE(tag, this->current_tag);
        // If we've already assigned this tag to this variable, return (can happen due to copy constraints)
        if (this->real_variable_tags[this->real_variable_index[variable_index]] == tag) {
            return;
        }

        BB_ASSERT_EQ(this->real_variable_tags[this->real_variable_index[variable_index]], DUMMY_TAG);
        this->real_variable_tags[this->real_variable_index[variable_index]] = tag;
    }

    uint32_t create_tag(const uint32_t tag_index, const uint32_t tau_index)
    {
        this->tau.insert({ tag_index, tau_index });
        this->current_tag++; // Why exactly?
        return this->current_tag;
    }

    uint32_t get_new_tag()
    {
        this->current_tag++;
        return this->current_tag;
    }

    RangeList create_range_list(const uint64_t target_range);
    void process_range_list(RangeList& list);
    void process_range_lists();

    /**
     * Custom Gate Selectors
     **/
    void apply_memory_selectors(const MEMORY_SELECTORS type);
    void apply_nnf_selectors(const NNF_SELECTORS type);

    /**
     * Non Native Field Arithmetic
     **/
    void range_constrain_two_limbs(const uint32_t lo_idx,
                                   const uint32_t hi_idx,
                                   const size_t lo_limb_bits = DEFAULT_NON_NATIVE_FIELD_LIMB_BITS,
                                   const size_t hi_limb_bits = DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
    std::array<uint32_t, 2> decompose_non_native_field_double_width_limb(
        const uint32_t limb_idx, const size_t num_limb_bits = (2 * DEFAULT_NON_NATIVE_FIELD_LIMB_BITS));
    std::array<uint32_t, 2> evaluate_non_native_field_multiplication(
        const non_native_multiplication_witnesses<FF>& input);
    std::array<uint32_t, 2> queue_partial_non_native_field_multiplication(
        const non_native_partial_multiplication_witnesses<FF>& input);
    using scaled_witness = std::pair<uint32_t, FF>;
    using add_simple = std::tuple<scaled_witness, scaled_witness, FF>;
    std::array<uint32_t, 5> evaluate_non_native_field_subtraction(add_simple limb0,
                                                                  add_simple limb1,
                                                                  add_simple limb2,
                                                                  add_simple limb3,
                                                                  std::tuple<uint32_t, uint32_t, FF> limbp);
    std::array<uint32_t, 5> evaluate_non_native_field_addition(add_simple limb0,
                                                               add_simple limb1,
                                                               add_simple limb2,
                                                               add_simple limb3,
                                                               std::tuple<uint32_t, uint32_t, FF> limbp);

    /**
     * Memory
     **/

    size_t create_ROM_array(const size_t array_size);
    void set_ROM_element(const size_t rom_id, const size_t index_value, const uint32_t value_witness);
    void set_ROM_element_pair(const size_t rom_id,
                              const size_t index_value,
                              const std::array<uint32_t, 2>& value_witnesses);

    uint32_t read_ROM_array(const size_t rom_id, const uint32_t index_witness);
    std::array<uint32_t, 2> read_ROM_array_pair(const size_t rom_id, const uint32_t index_witness);

    size_t create_RAM_array(const size_t array_size);
    void init_RAM_element(const size_t ram_id, const size_t index_value, const uint32_t value_witness);

    uint32_t read_RAM_array(const size_t ram_id, const uint32_t index_witness);
    void write_RAM_array(const size_t ram_id, const uint32_t index_witness, const uint32_t value_witness);
    // note that the `process_ROM_array` and `process_RAM_array` methods are controlled by `RomRamLogic` and hence are
    // not present here.

    void create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in);
    void create_poseidon2_internal_gate(const poseidon2_internal_gate_<FF>& in);

    uint256_t hash_circuit() const;

    msgpack::sbuffer export_circuit() override;
};
using UltraCircuitBuilder = UltraCircuitBuilder_<UltraExecutionTraceBlocks>;
} // namespace bb
