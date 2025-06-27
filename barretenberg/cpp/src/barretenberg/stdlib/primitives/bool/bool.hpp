// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../witness/witness.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib {
/**
 * @brief Implements boolean logic in-circuit.
 *
 * @details
 * ## Representing bools in-circuit
 *
 * To avoid constraining negation operations, we represent an in-circuit boolean \f$ a \f$ by a witness value \f$ w_a
 * \f$ and an `witness_inverted` flag \f$ i_a \f$. The value of \f$ a \f$ is defined via the equation:
 *
 * \f{align}{ w_a + i_a - 2 \cdot i_a \cdot w_a \f}
 *
 * When a new bool_t element \f$ a \f$ is created, its `witness_inverted` flag is set to `false` and
 * its `witness_value` is constrained to be \f$ 0 \f$  or \f$ 1\f$. More precisely, if \f$ a \f$ is a witness, then we
 * add a boolean constraint ensuring \f$ w_a^2 = w_a \f$, if \f$ a \f$ is a constant bool_t element, then it's checked
 * by an **ASSERT**.
 *
 * To negate \f$ a \f$ we simply flip the flag. Other basic operations are deduced from their algebraic representations
 * and the result is constrained to satisfy corresponding algebraic equation.
 *
 * ## Detailed example of an operation (logical OR)
 *
 * For example, to produce \f$ a || b \f$ in circuit, we compute
 * \f{align}{
 *     a + b - a \cdot b =  ( w_a \cdot (1- 2 i_a) + i_a) + ( w_b \cdot (1 - 2 i_b) + i_b) -
 *                       ( w_a \cdot (1-2 i_a) + i_a) ( w_b \cdot (1 - 2 i_b) + i_b)
 * \f}
 * Thus we can use a `poly` gate to constrain the result of a || b as follows:
 *
 * \f{align}{  q_m \cdot w_a \cdot w_b + q_l \cdot w_a + q_r \cdot w_b + q_o \cdot (a || b) + q_c  = 0\f}
 * where
 *    \f{eqnarray*}    q_m &=& -(1 - 2*i_a) * (1 - 2*i_b)   \\
 *                     q_l &=& (1 - 2 * i_a) * (1 - i_b)    \\
 *                     q_r &=& (1 - 2 * i_b) * (1 - i_a)    \\
 *                     q_o &=& -1                            \\
 *                     q_c &=& i_a + i_b - i_a * i_b        \f}
 * As \f$ w_a \f$  and \f$ w_b \f$ are constrained to be boolean, \f$ i_a \f$, \f$ i_b\f$ are boolean flags, we see that
 * \f$ (a || b)^2 = (a || b)\f$ (as a field element).
 */
template <typename Builder> class bool_t {
  public:
    bool_t(const bool value = false);
    bool_t(Builder* parent_context);
    bool_t(Builder* parent_context, const bool value);
    bool_t(const witness_t<Builder>& value);
    bool_t(const bool_t& other);
    bool_t(bool_t&& other);

    bool_t& operator=(const bool other);
    bool_t& operator=(const witness_t<Builder>& other);
    bool_t& operator=(const bool_t& other);
    bool_t& operator=(bool_t&& other);

    // bitwise operations
    bool_t operator&(const bool_t& other) const;
    bool_t operator|(const bool_t& other) const;
    bool_t operator^(const bool_t& other) const;
    bool_t operator!() const;

    // equality checks
    bool_t operator==(const bool_t& other) const;

    bool_t operator!=(const bool_t& other) const;

    // misc bool ops
    bool_t operator~() const { return operator!(); }

    bool_t operator&&(const bool_t& other) const;

    bool_t operator||(const bool_t& other) const;

    bool_t implies(const bool_t& other) const;

    bool_t implies_both_ways(const bool_t& other) const;

    // self ops
    void operator|=(const bool_t& other) { *this = operator|(other); }

    void operator&=(const bool_t& other) { *this = operator&(other); }

    void operator^=(const bool_t& other) { *this = operator^(other); }

    // assertions
    void assert_equal(const bool_t& rhs, std::string const& msg = "bool_t::assert_equal") const;

    static bool_t conditional_assign(const bool_t<Builder>& predicate, const bool_t& lhs, const bool_t& rhs);

    void must_imply(const bool_t& other, std::string const& msg = "bool_t::must_imply") const;

    void must_imply(const std::vector<std::pair<bool_t, std::string>>& conds) const;

    bool get_value() const { return witness_bool ^ witness_inverted; }

    bool is_constant() const { return witness_index == IS_CONSTANT; }

    bool_t normalize() const;

    uint32_t get_normalized_witness_index() const { return normalize().witness_index; }

    Builder* get_context() const { return context; }

    void set_origin_tag(const OriginTag& new_tag) const { tag = new_tag; }
    OriginTag get_origin_tag() const { return tag; }
    void set_free_witness_tag() { tag.set_free_witness(); }
    void unset_free_witness_tag() { tag.unset_free_witness(); }
    mutable Builder* context = nullptr;
    mutable bool witness_bool = false;
    mutable bool witness_inverted = false;
    mutable uint32_t witness_index = IS_CONSTANT;
    mutable OriginTag tag{};
};

template <typename T> inline std::ostream& operator<<(std::ostream& os, bool_t<T> const& v)
{
    return os << v.get_value();
}

} // namespace bb::stdlib
