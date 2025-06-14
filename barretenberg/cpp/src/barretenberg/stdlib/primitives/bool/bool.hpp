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
