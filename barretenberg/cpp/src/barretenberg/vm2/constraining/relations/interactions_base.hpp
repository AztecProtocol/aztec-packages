#pragma once

#include <cstddef>

#include "barretenberg/relations/generic_lookup/generic_lookup_relation.hpp"
#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

/////////////////// LOOKUPS ///////////////////

template <typename Settings_> struct lookup_settings : public Settings_ {
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    static constexpr size_t READ_TERM_TYPES[READ_TERMS] = { 0 };
    static constexpr size_t WRITE_TERM_TYPES[WRITE_TERMS] = { 0 };
    static constexpr size_t INVERSE_EXISTS_POLYNOMIAL_DEGREE = 4;
    static constexpr size_t READ_TERM_DEGREE = 0;
    static constexpr size_t WRITE_TERM_DEGREE = 0;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)) == 1 ||
                in.get(static_cast<ColumnAndShifts>(Settings_::DST_SELECTOR)) == 1);
    }

    template <typename Accumulator, typename AllEntities>
    static inline auto compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;
        const auto is_operation = View(in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)));
        const auto is_table_entry = View(in.get(static_cast<ColumnAndShifts>(Settings_::DST_SELECTOR)));
        return (is_operation + is_table_entry - is_operation * is_table_entry);
    }

    template <typename AllEntities> static inline auto get_entities(AllEntities&& in)
    {
        return []<size_t... ISource, size_t... IDest>(
                   AllEntities&& in, std::index_sequence<ISource...>, std::index_sequence<IDest...>) {
            return std::forward_as_tuple(in.get(static_cast<ColumnAndShifts>(Settings_::INVERSES)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::COUNTS)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::DST_SELECTOR)),
                                         in.get(Settings_::SRC_COLUMNS[ISource])...,
                                         in.get(Settings_::DST_COLUMNS[IDest])...);
        }(std::forward<AllEntities>(in),
               std::make_index_sequence<Settings_::SRC_COLUMNS.size()>{},
               std::make_index_sequence<Settings_::DST_COLUMNS.size()>{});
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return get_entities(in);
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return get_entities(in);
    }
};

template <typename FF_, typename Settings_> struct lookup_relation_base : public GenericLookupRelation<Settings_, FF_> {
    using Settings = Settings_;
    static constexpr std::string_view NAME = Settings::NAME;
    static constexpr std::string_view RELATION_NAME = Settings::RELATION_NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.get(static_cast<ColumnAndShifts>(Settings::INVERSES))).is_zero();
    }

    static std::string get_subrelation_label(size_t index)
    {
        switch (index) {
        case 0:
            return "INVERSES_ARE_CORRECT";
        case 1:
            return "ACCUMULATION_IS_CORRECT";
        default:
            return std::to_string(index);
        }
    }
};

/////////////////// PERMUTATIONS ///////////////////

template <typename Settings_> struct permutation_settings : public Settings_ {
    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)) == 1 ||
                in.get(static_cast<ColumnAndShifts>(Settings_::DST_SELECTOR)) == 1);
    }

    template <typename AllEntities> static inline auto get_entities(AllEntities&& in)
    {
        return []<size_t... ISource, size_t... IDest>(
                   AllEntities&& in, std::index_sequence<ISource...>, std::index_sequence<IDest...>) {
            // 0.                       The polynomial containing the inverse products -> taken from the attributes
            // 1.                       The polynomial enabling the relation (the selector)
            // 2.                       lhs selector
            // 3.                       rhs selector
            // 4.. + columns per set.   lhs cols
            // 4 + columns per set      rhs cols
            return std::forward_as_tuple(in.get(static_cast<ColumnAndShifts>(Settings_::INVERSES)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::SRC_SELECTOR)),
                                         in.get(static_cast<ColumnAndShifts>(Settings_::DST_SELECTOR)),
                                         in.get(Settings_::SRC_COLUMNS[ISource])...,
                                         in.get(Settings_::DST_COLUMNS[IDest])...);
        }(std::forward<AllEntities>(in),
               std::make_index_sequence<Settings_::SRC_COLUMNS.size()>{},
               std::make_index_sequence<Settings_::DST_COLUMNS.size()>{});
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return get_entities(in);
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return get_entities(in);
    }
};

template <typename FF_, typename Settings_>
struct permutation_relation_base : public GenericPermutationRelation<Settings_, FF_> {
    using Settings = Settings_;
    static constexpr std::string_view NAME = Settings::NAME;
    static constexpr std::string_view RELATION_NAME = Settings::RELATION_NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.get(static_cast<ColumnAndShifts>(Settings::INVERSES))).is_zero();
    }

    static std::string get_subrelation_label(size_t index)
    {
        switch (index) {
        case 0:
            return "INVERSES_ARE_CORRECT";
        case 1:
            return "ACCUMULATION_IS_CORRECT";
        default:
            return std::to_string(index);
        }
    }
};

} // namespace bb::avm2
