#pragma once
/// @file relation_operation_recorder.hpp
/// @brief Records the operations performed by the relations and replays them on a specific solver to produce SMT terms
/// @details We would like to run the relations on a specific solver to produce SMT terms several times and maybe for
/// different solver instances and even different types. This becomes an issue because then we have to provide context
/// somehow for each type and also parametrize each relation for each term. Instead, we record the operations performed
/// by the relations and replay them on a specific solver to produce SMT terms.
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

// Forward declarations to avoid circular dependencies
namespace smt_solver {
class Solver;
}

namespace smt_terms {
class STerm;
enum class TermType;
} // namespace smt_terms

namespace smt_relation_recorder {

// Forward declarations
template <typename NativeFF> class RecordingFF;
template <size_t LEN, typename FF> struct RecordingAccumulator;

/**
 * @brief Enum representing the type of field operation
 */
enum class OpKind {
    VAR,      // Variable/input
    CONST_FR, // Constant from bb::fr
    ADD,      // Addition
    SUB,      // Subtraction
    MUL,      // Multiplication
    NEG,      // Negation
    INV       // Inversion
};

/**
 * @brief Represents a single operation in the computation graph
 * Each operation has a unique ID and refers to inputs by their IDs
 */
struct Operation {
    OpKind kind;
    size_t result_id; // Unique ID for this operation's result

    // For binary operations (ADD, SUB, MUL): operand IDs
    size_t lhs_id = 0;
    size_t rhs_id = 0;

    // For unary operations (NEG): operand ID stored in lhs_id

    // For constants and variables: store the value/name
    std::variant<std::monostate, uint64_t, int64_t, int, uint256_t, bb::fr, std::string> value;

    Operation(OpKind k, size_t id)
        : kind(k)
        , result_id(id)
    {}
};

/**
 * @brief Records operations performed during relation execution
 * This acts as a "VM trace" of the computation
 */
class OperationTrace {
  public:
    std::vector<Operation> operations;
    size_t next_id = 0;

    // Stores accumulator results in index order
    std::vector<size_t> accumulator_results;

    /**
     * @brief Record a variable
     */
    size_t record_var(const std::string& name)
    {
        Operation op(OpKind::VAR, next_id++);
        op.value = name;
        operations.push_back(op);
        return op.result_id;
    }

    /**
     * @brief Record a constant field element
     *
     */
    size_t record_const_fr(const uint256_t& val)
    {
        Operation op(OpKind::CONST_FR, next_id++);
        op.value = val;
        operations.push_back(op);
        return op.result_id;
    }

    /**
     * @brief Record a binary operation
     */
    size_t record_binary_op(OpKind kind, size_t lhs, size_t rhs)
    {
        Operation op(kind, next_id++);
        op.lhs_id = lhs;
        op.rhs_id = rhs;
        operations.push_back(op);
        return op.result_id;
    }

    /**
     * @brief Record a unary operation
     */
    size_t record_unary_op(OpKind kind, size_t operand)
    {
        Operation op(kind, next_id++);
        op.lhs_id = operand;
        operations.push_back(op);
        return op.result_id;
    }

    /**
     * @brief Record the final value of an accumulator
     */
    void set_accumulator_result(size_t accumulator_idx, size_t operation_id)
    {
        if (accumulator_idx >= accumulator_results.size()) {
            accumulator_results.resize(accumulator_idx + 1, std::numeric_limits<size_t>::max());
        }
        accumulator_results[accumulator_idx] = operation_id;
    }
};

/**
 * @brief A field element type that records operations instead of executing them
 * This is used in place of SymFF during relation execution to record the computation
 *
 * @tparam NativeFF The native field type (e.g., grumpkin::fq for ECCVM, bb::fr for Translator)
 *                  Used to provide the correct modulus for compile-time checks in relations
 */
template <typename NativeFF> class RecordingFF {
  public:
    std::shared_ptr<OperationTrace> trace;
    std::optional<size_t> operation_id; // ID of the operation that produced this value
    bool is_constant;
    NativeFF constant_value;
    bool is_negative_constant; // If true, replay should negate this constant. It is here, because cvc5 struggles with
                               // large constants, so it's easier to negate the constant

    // Thread-local trace used for default construction
    static inline thread_local std::shared_ptr<OperationTrace> default_trace;

    // Modulus from the native field type for compile-time checks in relations
    // (e.g., get_curve_b() checks FF::modulus to determine curve coefficients)
    static constexpr uint256_t modulus = NativeFF::modulus;

    RecordingFF()
        : operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF::zero())
        , is_negative_constant(false)
    {}

    // Single-argument constructors for integers
    // Template constructor that accepts any integral type
    // For negative values, we store the absolute value and a flag to negate during replay.
    // This ensures the SMT solver sees small constants (e.g., 3) rather than large ones (p - 3),
    // which significantly improves solver performance.
    template <typename T, typename = std::enable_if_t<std::is_integral_v<T>>>
    RecordingFF(T val)
        : trace(default_trace ? default_trace : std::make_shared<OperationTrace>())
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(0))
        , is_negative_constant(false)
    {
        if constexpr (std::is_signed_v<T>) {
            if (val < 0) {
                is_negative_constant = true;
                constant_value = NativeFF(static_cast<uint64_t>(-static_cast<int64_t>(val)));
            } else {
                constant_value = NativeFF(static_cast<uint64_t>(val));
            }
        } else {
            constant_value = NativeFF(static_cast<uint64_t>(val));
        }
    }

    // Single-argument constructor from uint256_t (for relation constants)
    // Non-explicit to allow implicit conversion from uint256_t constants in relations
    RecordingFF(const uint256_t& val)
        : trace(default_trace ? default_trace : std::make_shared<OperationTrace>())
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(val))
        , is_negative_constant(false)
    {}

    // Constructor from bb::fr (for constants like curve_b)
    RecordingFF(const bb::fr& val)
        : trace(default_trace ? default_trace : std::make_shared<OperationTrace>())
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(static_cast<uint256_t>(val)))
        , is_negative_constant(false)
    {}

    // Constructor from bb::fq (for constants from curves like Grumpkin)
    // We convert through uint256_t since fq and fr may have different moduli
    RecordingFF(const bb::fq& val)
        : trace(default_trace ? default_trace : std::make_shared<OperationTrace>())
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(static_cast<uint256_t>(val)))
        , is_negative_constant(false)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t)
        : trace(t)
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF::zero())
        , is_negative_constant(false)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t, uint64_t val)
        : trace(t)
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(val))
        , is_negative_constant(false)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t, int val)
        : trace(t)
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(val >= 0 ? static_cast<uint64_t>(val) : static_cast<uint64_t>(-val)))
        , is_negative_constant(val < 0)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t, const uint256_t& val)
        : trace(t)
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(val))
        , is_negative_constant(false)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t, const bb::fr& val)
        : trace(t)
        , operation_id(std::nullopt)
        , is_constant(true)
        , constant_value(NativeFF(static_cast<uint256_t>(val)))
        , is_negative_constant(false)
    {}

    explicit RecordingFF(std::shared_ptr<OperationTrace> t, const std::string& var_name)
        : trace(t)
        , operation_id(trace->record_var(var_name))
        , is_constant(false)
        , constant_value(NativeFF::zero())
        , is_negative_constant(false)
    {}

  private:
    // Private tag type to distinguish operation ID constructor
    struct OperationIdTag {};

    // Private constructor for operation results (used by operator overloads)
    RecordingFF(std::shared_ptr<OperationTrace> t, size_t op_id, OperationIdTag)
        : trace(t)
        , operation_id(op_id)
        , is_constant(false)
        , constant_value(NativeFF::zero())
        , is_negative_constant(false)
    {}

  public:
    // Arithmetic operations - use 'This' type alias for cleaner code
    using This = RecordingFF<NativeFF>;

    This operator+(const This& other) const
    {
        if (is_constant && other.is_constant) {
            return This(trace, static_cast<uint256_t>(constant_value + other.constant_value));
        }

        if (is_constant && !other.is_constant) {
            return other + *this;
        }
        // We only initiate recording a constant when we start generating formulas. This is because we want to use the
        // static keyword in Relations. If we start recording operations while we are creating constants, those will
        // only be generated on the first call to the Relation. As a result, tests will fail if we rerun the same
        // relation.
        if (other.is_constant) {
            BB_ASSERT(trace && "Non-constant RecordingFF must have an associated trace");
            size_t constant_id = trace->record_const_fr(static_cast<uint256_t>(other.constant_value));
            // If the constant is negative, negate it: a + (-c) = a - c
            if (other.is_negative_constant) {
                size_t result_id_local = trace->record_binary_op(OpKind::SUB, operation_id.value(), constant_id);
                return This(trace, result_id_local, OperationIdTag{});
            }
            size_t result_id_local = trace->record_binary_op(OpKind::ADD, operation_id.value(), constant_id);
            return This(trace, result_id_local, OperationIdTag{});
        }
        BB_ASSERT(operation_id.has_value() && other.operation_id.has_value());
        size_t result_id_local = trace->record_binary_op(OpKind::ADD, operation_id.value(), other.operation_id.value());
        return This(trace, result_id_local, OperationIdTag{});
    }

    This operator-(const This& other) const
    {
        if (is_constant && other.is_constant) {
            // Handle sign combinations properly
            NativeFF result;
            if (is_negative_constant && other.is_negative_constant) {
                // (-a) - (-b) = -a + b = b - a
                result = other.constant_value - constant_value;
            } else if (is_negative_constant) {
                // (-a) - b = -(a + b)
                result = -(constant_value + other.constant_value);
            } else if (other.is_negative_constant) {
                // a - (-b) = a + b
                result = constant_value + other.constant_value;
            } else {
                result = constant_value - other.constant_value;
            }
            return This(trace, static_cast<uint256_t>(result));
        }

        if (is_constant && !other.is_constant) {
            // (const) - (var) cannot be commuted! This is a bug in the original code.
            // For now, record as NEG(var - const) = const - var
            BB_ASSERT(other.trace && "Non-constant RecordingFF must have an associated trace");
            size_t constant_id = other.trace->record_const_fr(static_cast<uint256_t>(constant_value));
            size_t sub_id = 0;
            if (is_negative_constant) {
                // (-c) - x = -(c + x)
                size_t add_id = other.trace->record_binary_op(OpKind::ADD, other.operation_id.value(), constant_id);
                sub_id = other.trace->record_unary_op(OpKind::NEG, add_id);
            } else {
                // c - x = -(x - c)
                size_t temp_id = other.trace->record_binary_op(OpKind::SUB, other.operation_id.value(), constant_id);
                sub_id = other.trace->record_unary_op(OpKind::NEG, temp_id);
            }
            return This(other.trace, sub_id, OperationIdTag{});
        }

        if (other.is_constant) {
            BB_ASSERT(trace && "Non-constant RecordingFF must have an associated trace");
            size_t constant_id = trace->record_const_fr(static_cast<uint256_t>(other.constant_value));
            // If the constant is negative: a - (-c) = a + c
            if (other.is_negative_constant) {
                size_t result_id_local = trace->record_binary_op(OpKind::ADD, operation_id.value(), constant_id);
                return This(trace, result_id_local, OperationIdTag{});
            }
            size_t result_id_local = trace->record_binary_op(OpKind::SUB, operation_id.value(), constant_id);
            return This(trace, result_id_local, OperationIdTag{});
        }

        BB_ASSERT(operation_id.has_value() && other.operation_id.has_value());
        size_t result_id_local = trace->record_binary_op(OpKind::SUB, operation_id.value(), other.operation_id.value());
        return This(trace, result_id_local, OperationIdTag{});
    }

    This operator*(const This& other) const
    {
        if (is_constant && other.is_constant) {
            // Handle sign: (-a) * (-b) = a*b, (-a) * b = -(a*b), etc.
            NativeFF result = constant_value * other.constant_value;
            bool result_negative = is_negative_constant != other.is_negative_constant;
            if (result_negative) {
                result = -result;
            }
            return This(trace, static_cast<uint256_t>(result));
        }

        if (is_constant && !other.is_constant) {
            return other * *this;
        }

        if (other.is_constant) {
            BB_ASSERT(trace && "Non-constant RecordingFF must have an associated trace");
            size_t constant_id = trace->record_const_fr(static_cast<uint256_t>(other.constant_value));
            size_t result_id_local = trace->record_binary_op(OpKind::MUL, operation_id.value(), constant_id);
            // If the constant is negative, negate the result: a * (-c) = -(a * c)
            if (other.is_negative_constant) {
                result_id_local = trace->record_unary_op(OpKind::NEG, result_id_local);
            }
            return This(trace, result_id_local, OperationIdTag{});
        }

        BB_ASSERT(operation_id.has_value() && other.operation_id.has_value());
        size_t result_id_local = trace->record_binary_op(OpKind::MUL, operation_id.value(), other.operation_id.value());
        return This(trace, result_id_local, OperationIdTag{});
    }

    This& operator*=(const This& other)
    {
        *this = *this * other;
        return *this;
    }

    This& operator+=(const This& other)
    {
        *this = *this + other;
        return *this;
    }

    // Allow += with RecordingAccumulator (extracts the val field)
    template <size_t LEN> This& operator+=(const RecordingAccumulator<LEN, This>& other)
    {
        *this = *this + other.val;
        return *this;
    }

    This& operator-=(const This& other)
    {
        *this = *this - other;
        return *this;
    }

    This sqr() const { return *this * *this; }

    This invert() const
    {
        if (is_constant) {
            return This(trace, static_cast<uint256_t>(constant_value.invert()));
        }

        size_t result_id_local = trace->record_unary_op(OpKind::INV, operation_id.value());
        return This(trace, result_id_local, OperationIdTag{});
    }

    This operator-() const
    {
        if (is_constant) {
            return This(trace, static_cast<uint256_t>(-constant_value));
        }

        size_t result_id_local = trace->record_unary_op(OpKind::NEG, operation_id.value());
        return This(trace, result_id_local, OperationIdTag{});
    }

    // Friend operations for scalar * RecordingFF
    friend This operator*(const uint256_t& c, const This& x)
    {
        auto converted = bb::fr(c);
        return converted * x;
    }

    friend This operator*(const bb::fr& c, const This& x) { return This(c) * x; }

    friend This operator+(const bb::fr& c, const This& x)
    {
        auto converted = This(bb::fr(c));
        return converted + x;
    }

    friend This operator-(const bb::fr& c, const This& x)
    {
        auto converted = This(bb::fr(c));
        return converted - x;
    }

    // Operations with integer literals
    friend This operator+(const This& x, int c) { return x + This(c); }

    friend This operator+(int c, const This& x) { return This(c) + x; }

    friend This operator-(const This& x, int c) { return x - This(c); }

    friend This operator-(int c, const This& x) { return This(c) - x; }

    friend This operator*(const This& x, int c) { return x * This(c); }

    friend This operator*(int c, const This& x) { return This(c) * x; }

    // Operations with uint64_t
    friend This operator+(const This& x, uint64_t c) { return x + This(c); }

    friend This operator+(uint64_t c, const This& x) { return This(c) + x; }

    friend This operator-(const This& x, uint64_t c) { return x - This(c); }

    friend This operator-(uint64_t c, const This& x) { return This(c) - x; }

    friend This operator*(const This& x, uint64_t c) { return x * This(c); }

    friend This operator*(uint64_t c, const This& x) { return This(c) * x; }
};

/**
 * @brief Accumulator that records additions
 * @tparam LEN Length parameter for compatibility with relation accumulator requirements
 * @tparam FF The RecordingFF type (e.g., RecordingFF<grumpkin::fq>)
 */
template <size_t LEN, typename FF> struct RecordingAccumulator {
    using ValueType = FF;
    using View = FF;
    FF val;

    // Default constructor
    RecordingAccumulator() = default;

    // Constructor from integer (for initialization with 0)
    RecordingAccumulator(int value)
        : val(value)
    {}

    // Constructor from FF
    RecordingAccumulator(const FF& x)
        : val(x)
    {}

    RecordingAccumulator& operator+=(const FF& x)
    {
        val = val + x;
        return *this;
    }

    template <size_t OTHER_LEN> RecordingAccumulator& operator+=(const RecordingAccumulator<OTHER_LEN, FF>& other)
    {
        val = val + other.val;
        return *this;
    }

    RecordingAccumulator& operator*=(const FF& x)
    {
        val = val * x;
        return *this;
    }

    template <size_t OTHER_LEN> RecordingAccumulator& operator*=(const RecordingAccumulator<OTHER_LEN, FF>& other)
    {
        val = val * other.val;
        return *this;
    }

    RecordingAccumulator& operator-=(const FF& x)
    {
        val = val - x;
        return *this;
    }

    template <size_t OTHER_LEN> RecordingAccumulator& operator-=(const RecordingAccumulator<OTHER_LEN, FF>& other)
    {
        val = val - other.val;
        return *this;
    }

    // Arithmetic operations with FF
    RecordingAccumulator operator*(const FF& x) const
    {
        RecordingAccumulator result;
        result.val = val * x;
        return result;
    }

    RecordingAccumulator operator+(const FF& x) const
    {
        RecordingAccumulator result;
        result.val = val + x;
        return result;
    }

    RecordingAccumulator operator-(const FF& x) const
    {
        RecordingAccumulator result;
        result.val = val - x;
        return result;
    }

    RecordingAccumulator operator-(int x) const
    {
        RecordingAccumulator result;
        result.val = val - FF(x);
        return result;
    }

    RecordingAccumulator operator+(int x) const
    {
        RecordingAccumulator result;
        result.val = val + FF(x);
        return result;
    }

    RecordingAccumulator operator*(int x) const
    {
        RecordingAccumulator result;
        result.val = val * FF(x);
        return result;
    }

    // Friend operators for reverse order operations
    friend RecordingAccumulator operator*(const FF& x, const RecordingAccumulator& acc)
    {
        RecordingAccumulator result;
        result.val = x * acc.val;
        return result;
    }

    friend RecordingAccumulator operator+(const FF& x, const RecordingAccumulator& acc)
    {
        RecordingAccumulator result;
        result.val = x + acc.val;
        return result;
    }

    friend RecordingAccumulator operator-(const FF& x, const RecordingAccumulator& acc)
    {
        RecordingAccumulator result;
        result.val = x - acc.val;
        return result;
    }

    // Operations with other accumulators
    RecordingAccumulator operator+(const RecordingAccumulator& other) const
    {
        RecordingAccumulator result;
        result.val = val + other.val;
        return result;
    }

    RecordingAccumulator operator-(const RecordingAccumulator& other) const
    {
        RecordingAccumulator result;
        result.val = val - other.val;
        return result;
    }

    RecordingAccumulator operator*(const RecordingAccumulator& other) const
    {
        RecordingAccumulator result;
        result.val = val * other.val;
        return result;
    }

    // Unary negation
    RecordingAccumulator operator-() const
    {
        RecordingAccumulator result;
        result.val = -val;
        return result;
    }
};

/**
 * @brief Replay recorded operations on a specific solver to produce SMT terms
 */
class OperationReplayer {
  public:
    /**
     * @brief Replay operations to produce actual SMT terms for a given solver
     * @param trace The recorded operation trace
     * @param solver The SMT solver to create terms with
     * @param initial_variables The initial variables to use for the replay
     * @param is_ffi Whether to use FFI terms (true) or FF terms (false)
     * @return Vector of SMT terms
     */
    static std::vector<smt_terms::STerm> replay(const OperationTrace& trace,
                                                smt_solver::Solver* solver,
                                                std::unordered_map<std::string, smt_terms::STerm>& initial_variables,
                                                bool is_ffi = false);
};

// Type aliases for specific VM recording types
// ECCVM uses grumpkin::fq (= BN254 fr) as the field for point coordinates
using ECCVMRecordingFF = RecordingFF<bb::grumpkin::fq>;
template <size_t LEN> using ECCVMRecordingAccumulator = RecordingAccumulator<LEN, ECCVMRecordingFF>;

// Translator uses BN254 fr as the native field
using TranslatorRecordingFF = RecordingFF<bb::fr>;
template <size_t LEN> using TranslatorRecordingAccumulator = RecordingAccumulator<LEN, TranslatorRecordingFF>;

// ============================================================================
// Template helpers to auto-generate accumulator tuples from relation metadata
// ============================================================================

namespace detail {

// Primary template for generating accumulator tuple from SUBRELATION_PARTIAL_LENGTHS
template <typename Relation, typename FF, size_t... Is>
auto make_accumulator_tuple_from_indices(std::index_sequence<Is...>)
{
    return std::tuple<RecordingAccumulator<Relation::SUBRELATION_PARTIAL_LENGTHS[Is], FF>...>{};
}

template <typename Relation, typename FF> auto make_accumulator_tuple()
{
    constexpr size_t N = Relation::SUBRELATION_PARTIAL_LENGTHS.size();
    return make_accumulator_tuple_from_indices<Relation, FF>(std::make_index_sequence<N>{});
}

} // namespace detail

/**
 * @brief Generic function to replay a recorded relation
 * @param trace The recorded operation trace
 * @param solver The SMT solver
 * @param original_names The list of original variable names
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms
 * @param out_formulas Output vector for relation formulas
 * @param out_vars Output vector for variables
 * @param out_names Output vector for variable names
 * @param extra_param_names Additional parameter names to include
 */
void replay_relation_generic(const OperationTrace& trace,
                             smt_solver::Solver* solver,
                             const std::vector<std::string>& original_names,
                             const std::string& prefix,
                             bool use_ffi,
                             std::vector<smt_terms::STerm>& out_formulas,
                             std::vector<smt_terms::STerm>& out_vars,
                             std::vector<std::string>& out_names,
                             const std::vector<std::string>& extra_param_names = {});

} // namespace smt_relation_recorder
