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
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

#include "circuit_builder_base.hpp"
#include "rom_ram_logic.hpp"
#include <deque>
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

    static constexpr std::string_view NAME_STRING = "UltraCircuitBuilder";
    // The plookup range proof requires work linear in range size, thus cannot be used directly for
    // large ranges such as 2^64. For such ranges the element will be decomposed into smaller
    // chuncks according to the parameter below
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_BITNUM = 14;
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_STEP_SIZE = 3;
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_SIZE = (1 << DEFAULT_PLOOKUP_RANGE_BITNUM) - 1;
    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = 68;

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
        uint64_t target_range; // range constraint will be for the range [0, target_range].
        uint32_t range_tag;    // Every variable that is range-constrained to a given `target_range` has the same tag,
                               // namely, `range_tag`. Never `DUMMY_TAG`.
        uint32_t tau_tag;      // Tag assigned to the sorted reference set. Never `DUMMY_TAG`.
        std::vector<uint32_t>
            variable_indices; // All variable-indices constrained to this range. During processing, this will be
                              // mutated: replaced by real-variable-indices, then deduplicated.
        bool operator==(const RangeList& other) const noexcept
        {
            return target_range == other.target_range && range_tag == other.range_tag && tau_tag == other.tau_tag &&
                   variable_indices == other.variable_indices;
        }
    };

    // AUDITTODO: this is not a large optimization (~0.5% reduction for ultra rec verifier); consider removing
    /**
     * @brief Used to store instructions to create partial_non_native_field_multiplication gates.
     * @details We want to cache these (and remove duplicates) as the stdlib code can end up multiplying the same inputs
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

  private:
    // The set of lookup tables used by the circuit, plus the gate data for the lookups from each table
    std::deque<plookup::BasicTable> lookup_tables;

  public:
    // Storage for wires and selectors for all gate types
    ExecutionTrace blocks;

    // The set of variables which have been constrained to a particular value via an arithmetic gate
    std::unordered_map<FF, uint32_t> constant_variable_indices;

    // Rom/Ram logic
    RomRamLogic rom_ram_logic;

    // Stores gate index of ROM/RAM reads (required by proving key)
    std::vector<uint32_t> memory_read_records;
    // Stores gate index of RAM writes (required by proving key)
    std::vector<uint32_t> memory_write_records;
    std::map<uint64_t, RangeList> range_lists; // DOCTODO: explain this.

    std::vector<cached_partial_non_native_field_multiplication> cached_partial_non_native_field_multiplications;

    bool circuit_finalized = false;

    std::vector<fr> ipa_proof;

    void populate_public_inputs_block();

    void process_non_native_field_multiplications();

    UltraCircuitBuilder_(const size_t size_hint = 0, bool is_write_vk_mode = false)
        : CircuitBuilderBase<FF>(size_hint, is_write_vk_mode)
    {
        this->set_zero_idx(put_constant_variable(FF::zero()));
        // The identity permutation on the set `{DUMMY_TAG}`. We therefore assume that the
        // `DUMMY_TAG` is not involved in any non-trivial multiset-equality checks.
        this->set_tau_at_index(DUMMY_TAG, DUMMY_TAG);
    };

    /**
     * @brief Constructor from data generated from ACIR
     *
     * @param size_hint
     * @param witness_values witnesses values known to acir
     * @param public_inputs indices of public inputs in witness array
     * @param is_write_vk_mode true if the builder is use to generate the vk of a circuit
     *
     * @note witness_values is the vector of witness values known at the time of acir generation. It is filled with
     * witness values which are interleaved with zeros when witnesses are optimized away.
     *
     * @note The length of the witness vector is in general less than total number of variables/witnesses that might be
     * present for a circuit generated from acir, since many gates will depend on the details of the bberg
     * implementation (or more generally on the backend used to process acir).
     *
     */
    UltraCircuitBuilder_(const size_t size_hint,
                         const std::vector<FF>& witness_values,
                         const std::vector<uint32_t>& public_inputs,
                         const bool is_write_vk_mode)
        : CircuitBuilderBase<FF>(size_hint, is_write_vk_mode)
    {
        for (const auto value : witness_values) {
            this->add_variable(value);
        }

        // Initialize the builder public_inputs directly from the acir public inputs.
        this->initialize_public_inputs(public_inputs);

        // Add the const zero variable after the acir witness has been
        // incorporated into variables.
        this->set_zero_idx(put_constant_variable(FF::zero()));
        this->_tau.insert({ DUMMY_TAG, DUMMY_TAG }); // TODO(luke): explain this
    };
    UltraCircuitBuilder_(const UltraCircuitBuilder_& other) = default;
    UltraCircuitBuilder_(UltraCircuitBuilder_&& other) = default;
    UltraCircuitBuilder_& operator=(const UltraCircuitBuilder_& other) = default;
    UltraCircuitBuilder_& operator=(UltraCircuitBuilder_&& other) = default;
    ~UltraCircuitBuilder_() override = default;

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
            const auto& block_selectors = block.get_selectors();
            size_t nominal_size = block_selectors[0].size();
            for (size_t idx = 1; idx < block_selectors.size(); ++idx) {
                BB_ASSERT_EQ(block_selectors[idx].size(), nominal_size);
            }
        }

#endif // NDEBUG
    }

    void finalize_circuit(const bool ensure_nonzero);

    void add_gates_to_ensure_all_polys_are_non_zero();

    void create_add_gate(const add_triple_<FF>& in);
    void create_big_mul_add_gate(const mul_quad_<FF>& in, const bool use_next_gate_w_4 = false);
    void create_big_add_gate(const add_quad_<FF>& in, const bool use_next_gate_w_4 = false);

    void create_bool_gate(const uint32_t a);
    void create_arithmetic_gate(const arithmetic_triple_<FF>& in);
    void create_ecc_add_gate(const ecc_add_gate_<FF>& in);
    void create_ecc_dbl_gate(const ecc_dbl_gate_<FF>& in);

    void fix_witness(const uint32_t witness_index, const FF& witness_value);

    /**
     * @brief Low-level range constraint for small ranges. Adds variable to a RangeList for batched processing.
     * @details Constrains variable to [0, target_range]. The constraint is deferred: variables are collected
     * into RangeLists (grouped by target_range), then processed together in `process_range_lists()` which
     * creates the actual delta-range gates. This batching is efficient because multiple variables sharing
     * the same range can share the "staircase" of multiples-of-3 values.
     *
     * @note Only suitable for small ranges (≤ DEFAULT_PLOOKUP_RANGE_SIZE). For larger ranges, use
     * `create_limbed_range_constraint` which decomposes into smaller limbs.
     * @note The tag of `variable_index` is `DUMMY_TAG` if it has never been range-constrained and a non-trivial value
     * else. In other words, the non-trivial tags that occur for witnesses in the first phase of witness-generation
     * _precisely_ correspond to existing ranges (a.k.a. `target_range`s) being used in range-constraints.
     */
    void create_small_range_constraint(const uint32_t variable_index,
                                       const uint64_t target_range,
                                       std::string const msg = "create_small_range_constraint");

    /**
     * @brief Main entry point for range constraints. Dispatches to appropriate implementation based on range size.
     * @details
     *   - 1 bit: uses a boolean gate (x * (x - 1) = 0)
     *   - ≤ DEFAULT_PLOOKUP_RANGE_BITNUM bits: uses `create_new_range_constraint` (batched delta-range)
     *   - > DEFAULT_PLOOKUP_RANGE_BITNUM bits: uses `create_limbed_range_constraint` (first decompose into limbs)
     */
    void create_range_constraint(const uint32_t variable_index, const size_t num_bits, std::string const& msg)
    {
        if (num_bits == 1) {
            create_bool_gate(variable_index);
        } else if (num_bits <= DEFAULT_PLOOKUP_RANGE_BITNUM) {
            /**
             * NOTE: We add a dummy arithmetic gate for the following reason: if `variable_index` is not used in any
             *       gate, then its tag would never appear in the permutation polynomials. This would yield an
             *       unsatisfiable circuit, i.e., the GPA would fail: the range constraint will increase the size of the
             *       sorted set of range-constrained integers by one, while the non-sorted set (which is given by a
             *       subset of wire indices) would remain unchanged.
             *
             **/
            create_arithmetic_gate(arithmetic_triple_<FF>{
                .a = variable_index,
                .b = variable_index,
                .c = variable_index,
                .q_m = 0,
                .q_l = 1,
                .q_r = -1,
                .q_o = 0,
                .q_c = 0,
            });
            create_small_range_constraint(variable_index, (1ULL << num_bits) - 1, msg);
        } else {
            create_limbed_range_constraint(variable_index, num_bits, DEFAULT_PLOOKUP_RANGE_BITNUM, msg);
        }
    }

    uint32_t put_constant_variable(const FF& variable);

    size_t get_num_constant_gates() const override { return 0; }

    /**
     * @brief Get the number of gates in a finalized circuit.
     * @return size_t
     */
    size_t get_num_finalized_gates() const override
    {
        BB_ASSERT(circuit_finalized);
        return this->num_gates();
    }

    /**
     * @brief Get the number of gates in the finalized version of the circuit.
     * @warning This method makes a copy then finalizes it and returns the
     * number of gates. It is therefore inefficient and should only be used in testing/debugging scenarios.
     *
     * @param ensure_nonzero Whether or not to add gates to ensure all polynomials are non-zero during finalization.
     * @return size_t
     */
    size_t get_num_finalized_gates_inefficient(bool ensure_nonzero = true) const
    {
        UltraCircuitBuilder_ builder_copy = *this;
        builder_copy.finalize_circuit(ensure_nonzero);
        return builder_copy.get_num_finalized_gates();
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
        BB_ASSERT(circuit_finalized);
        auto num_filled_gates = get_num_finalized_gates() + this->num_public_inputs();
        return std::max(get_tables_size(), num_filled_gates);
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
    plookup::BasicTable& get_table(const plookup::BasicTableId id);
    plookup::MultiTable& get_multitable(const plookup::MultiTableId id);

    // Accessors for lookup tables
    const std::deque<plookup::BasicTable>& get_lookup_tables() const { return lookup_tables; }
    std::deque<plookup::BasicTable>& get_lookup_tables() { return lookup_tables; }
    size_t get_num_lookup_tables() const { return lookup_tables.size(); }

    plookup::ReadData<uint32_t> create_gates_from_plookup_accumulators(
        const plookup::MultiTableId& id,
        const plookup::ReadData<FF>& read_values,
        const uint32_t key_a_index,
        std::optional<uint32_t> key_b_index = std::nullopt);

    /**
     * @brief Range-constrain a variable to [0, 2^num_bits - 1] by decomposing into smaller limbs.
     * @details For large ranges, direct range-checking is too expensive (scales linearly in the `target_range`).
     * Instead, we decompose the value into limbs of `target_range_bitnum` bits, call `create_new_range_constraint` on
     * each limb, and add arithmetic gates proving the limbs reconstruct the original value.
     *
     * @return The variable indices of the limbs.
     */
    std::vector<uint32_t> create_limbed_range_constraint(
        const uint32_t variable_index,
        const uint64_t num_bits,
        const uint64_t target_range_bitnum = DEFAULT_PLOOKUP_RANGE_BITNUM,
        std::string const& msg = "create_limbed_range_constraint");

    /**
     * @brief Create a gate with no constraints but with possibly non-trivial wire values
     * @details A dummy gate can be used to provide wire values to be accessed via shifts by the gate that proceeds it.
     * The dummy gate itself does not have to satisfy any constraints (all selectors are zero).
     *
     * @tparam ExecutionTrace
     * @param block Execution trace block into which the dummy gate is to be placed
     */
    void create_unconstrained_gate(
        auto& block, const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
    {
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        block.q_m().emplace_back(0);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_4().emplace_back(0);
        block.set_gate_selector(0); // all selectors zero

        check_selector_length_consistency();
        this->increment_num_gates();
    }
    void create_unconstrained_gates(const std::vector<uint32_t>& variable_index);

    /**
     * @brief Check for a sequence of variables that the neighborind differences are in {0, 1, 2, 3} via the delta_range
     * block.
     *
     * @param variable_indices
     */
    void enforce_small_deltas(const std::vector<uint32_t>& variable_indices);
    /**
     * @brief Constrain consecutive variable differences to be in {0, 1, 2, 3}, _with_ boundary checks.
     *
     * @details Enforces that:
     *   1. variable_indices[0] == start
     *   2. variable_indices[i+1] - variable_indices[i] ∈ {0, 1, 2, 3} for all adjacent pairs
     *   3. variable_indices[last] == end
     *
     * This is the core primitive for batched range checks: given a sorted list with bounded deltas
     * starting at 0 and ending at N, all elements are proven to lie in [0, N].
     *
     * @param variable_indices The sequence of variable indices to constrain. Must have size > NUM_WIRES
     *                         and divisible by NUM_WIRES (pad if necessary).
     * @param start The required value of the first element.
     * @param end The required value of the last element.
     */
    void create_sort_constraint_with_edges(const std::vector<uint32_t>& variable_indices,
                                           const FF& start,
                                           const FF& end);

    /**
     * Generalized Permutation Methods
     **/
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
    /**
     * @brief Set the tau(tag_index) = tau_index
     *
     * @param tag_index
     * @param tau_index
     * @return uint32_t
     */
    void set_tau_at_index(const uint32_t tag_index, const uint32_t tau_index)
    {
        this->_tau.insert({ tag_index, tau_index });
    }
    /**
     * @brief Add a transposition to tau.
     *
     * @details Adds a simple transposition to the tau permutation, namely, swaps `tag_index_1` and `tag_index_2`.
     *
     * @param tag_index_1
     * @param tag_index_2
     * @return uint32_t
     * @note This is the only operation we need in our builders as our tau-permutations are products _disjoint_
     * transpositions. Indeed, they are only used in memory operations and range constraints, where we simply check that
     * the multisets of unsorted and sorted witnesses (or records) are the same.
     */
    void set_tau_transposition(const uint32_t tag_index_1, const uint32_t tag_index_2)
    {
        set_tau_at_index(tag_index_1, tag_index_2);
        set_tau_at_index(tag_index_2, tag_index_1);
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
                                   const size_t hi_limb_bits = DEFAULT_NON_NATIVE_FIELD_LIMB_BITS,
                                   std::string const& msg = "range_constrain_two_limbs");
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

    void create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in);
    void create_poseidon2_internal_gate(const poseidon2_internal_gate_<FF>& in);

    // ========================================================================================
    // TOOLING: Boomerang Detection
    // ========================================================================================
    // The boomerang mechanism enables detection of variables used in only one gate, which may
    // indicate bugs.
    // Note: some patterns (like x*(x^-1)=1 for non-zero checks) intentionally employ single-use witnesses. These
    // members and methods allow excluding such witnesses from boomerang detection.

  private:
    // Witnesses that can be in one gate, but that's intentional (used in boomerang catcher)
    std::vector<uint32_t> used_witnesses;
    // Witnesses that appear in finalize method (used in boomerang catcher). Need to check
    // that all variables from some connected component were created after finalize method was called
    std::unordered_set<uint32_t> finalize_witnesses;

  public:
    const std::vector<uint32_t>& get_used_witnesses() const { return used_witnesses; }
    const std::unordered_set<uint32_t>& get_finalize_witnesses() const { return finalize_witnesses; }

    /**
     * @brief Add a witness index to the boomerang exclusion list
     * @param var_idx Witness index to add to the boomerang exclusion list
     * @details Barretenberg has special boomerang value detection logic that detects variables that are used in one
     * gate However, there are some cases where we want to exclude certain variables from this detection (for example,
     * when we show that x!=0 -> x*(x^-1) = 1).
     */
    void update_used_witnesses(uint32_t var_idx) { used_witnesses.emplace_back(var_idx); }

    /**
     * @brief Add a list of witness indices to the boomerang exclusion list
     * @param used_indices List of witness indices to add to the boomerang exclusion list
     * @details Barretenberg has special boomerang value detection logic that detects variables that are used in one
     * gate However, there are some cases where we want to exclude certain variables from this detection (for example,
     * when we show that x!=0 -> x*(x^-1) = 1).
     */
    void update_used_witnesses(const std::vector<uint32_t>& used_indices)
    {
        used_witnesses.reserve(used_witnesses.size() + used_indices.size());
        for (const auto& it : used_indices) {
            used_witnesses.emplace_back(it);
        }
    }

    /**
     * @brief Add a witness index to the finalize exclusion list
     * @param var_idx Witness index to add to the finalize exclusion list
     * @details Barretenberg has special isolated subcircuit detection logic that ensures that variables in the main
     * circuit are all connected. However, during finalization we intentionally create some subcircuits that are only
     * connected through the set permutation. We want to exclude these variables from this detection.
     */
    void update_finalize_witnesses(uint32_t var_idx) { finalize_witnesses.insert(var_idx); }

    /**
     * @brief Add a list of witness indices to the finalize exclusion list
     * @param finalize_indices List of witness indices to add to the finalize exclusion list
     * @details Barretenberg has special isolated subcircuit detection logic that ensures that variables in the main
     * circuit are all connected. However, during finalization we intentionally create some subcircuits that are only
     * connected through the set permutation. We want to exclude these variables from this detection.
     */
    void update_finalize_witnesses(const std::vector<uint32_t>& finalize_indices)
    {
        for (const auto& it : finalize_indices) {
            finalize_witnesses.insert(it);
        }
    }

    // ========================================================================================

    msgpack::sbuffer export_circuit() override;
};
using UltraCircuitBuilder = UltraCircuitBuilder_<UltraExecutionTraceBlocks>;
} // namespace bb
