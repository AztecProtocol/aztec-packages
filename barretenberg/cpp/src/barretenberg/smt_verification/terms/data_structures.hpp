#pragma once
#include <algorithm>
#include <concepts>
#include <iterator>

#include "term.hpp"

namespace smt_terms {
using namespace smt_solver;

/**
 * @brief sym Tuple class
 *
 * @details allows to group separate STerms in one place
 */
class STuple {
  public:
    Solver* solver;
    cvc5::Term term;
    TermType type = TermType::STuple;

    STuple()
        : solver(nullptr)
        , term(cvc5::Term()){};

    STuple(const cvc5::Term& term, Solver* s, TermType type = TermType::STuple)
        : solver(s)
        , term(term)
        , type(type){};

    /**
     * @brief Construct a new STuple object
     *
     * @param terms vector of terms to store in tuple
     */
    STuple(const std::vector<STerm>& terms)
    {
        if (terms.size() == 0) {
            throw std::invalid_argument("Empty vector occured during STuple initialization");
        }
        this->solver = terms[0].solver;

        std::vector<cvc5::Term> terms_;
        terms_.reserve(terms.size());
        auto map = [](const STerm& t) -> cvc5::Term { return t.term; };
        std::transform(terms.begin(), terms.end(), std::back_inserter(terms_), map);
        this->term = this->solver->term_manager.mkTuple(terms_);
    }

    /**
     * Create an equality constraint between two symbolic tuples of the same type
     *
     */
    void operator==(const STuple& other) const
    {
        cvc5::Term eq = this->solver->term_manager.mkTerm(cvc5::Kind::EQUAL, { this->term, other.term });
        this->solver->assertFormula(eq);
    }

    /**
     * Create an inequality constraint between two symbolic tuples of the same type
     *
     */
    void operator!=(const STuple& other) const
    {
        cvc5::Term eq = this->solver->term_manager.mkTerm(cvc5::Kind::EQUAL, { this->term, other.term });
        eq = this->solver->term_manager.mkTerm(cvc5::Kind::NOT, { eq });
        this->solver->assertFormula(eq);
    }

    /**
     * @brief Get the obtained tuple sort
     *
     * @return cvc5::Sort
     */
    cvc5::Sort get_sort() const { return this->term.getSort(); }

    operator std::string() const { return this->solver->stringify_term(term); };
    operator cvc5::Term() const { return term; };

    friend std::ostream& operator<<(std::ostream& out, const STuple& term)
    {
        return out << static_cast<std::string>(term);
    };

    STuple(const STuple& other) = default;
    STuple(STuple&& other) = default;
    STuple& operator=(const STuple& right) = default;
    STuple& operator=(STuple&& right) = default;
    ~STuple() = default;
};

template <typename T>
concept ConstructibleFromTerm = requires(const cvc5::Term& term, Solver* s, TermType type) {
    T{ term, s, type };
};

/**
 * @brief symbolic Array class
 *
 * @details allows to group separate STerms in one place
 * and perform operations over sym indicies
 * Compatible parameters:
 * STerm
 * Bool
 * STuple
 * SymArray
 * SymSet
 */
template <typename sym_index, ConstructibleFromTerm sym_entry> class SymArray {
  private:
  public:
    Solver* solver;
    cvc5::Term term;

    TermType type = TermType::SymArray;
    TermType ind_type;
    TermType entry_type;

    SymArray()
        : solver(nullptr)
        , term(cvc5::Term())
        , ind_type(TermType::FFTerm)
        , entry_type(TermType::FFTerm){};

    SymArray(const cvc5::Term& term, Solver* s, TermType type = TermType::SymArray)
        : solver(s)
        , term(term)
        , type(type)
    {
        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }
    };

    /**
     * @brief Construct an empty Symbolic Array object
     *
     * @param index_sort cvc5 Sort of an index
     * @param index_type type of index Symbolic Term
     * @param entry_sort cvc5 Sort of an entry
     * @param entry_type type of entry Symbolic Term
     * @param s pointer to solver
     * @param name name of the resulting symbolic variable, defaults to var_{i}
     */
    SymArray(const cvc5::Sort& index_sort,
             const TermType& index_type,
             const cvc5::Sort& entry_sort,
             const TermType& entry_type,
             Solver* s,
             const std::string& name = "")
        : solver(s)
        , ind_type(index_type)
        , entry_type(entry_type)
    {
        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }

        cvc5::Sort Array = this->solver->term_manager.mkArraySort(index_sort, entry_sort);
        if (name.empty()) {
            this->term = this->solver->term_manager.mkConst(Array);
        } else {
            this->term = this->solver->term_manager.mkConst(Array, name);
        }
    }

    /**
     * @brief Construct a new Symbolic Array object
     *
     * @param indicies vector of symbolic objects
     * @param entries vector of symbolic objects
     * @param name name of the resulting symbolic variable, defaults to var_{i}
     */
    SymArray(const std::vector<sym_index>& indicies,
             const std::vector<sym_entry>& entries,
             const std::string& name = "")
    {
        if (entries.size() == 0 || indicies.size() == 0) {
            throw std::invalid_argument("Empty vector occured during SymArray initialization");
        }

        if (entries.size() != indicies.size()) {
            throw std::invalid_argument("Indicies must have the same dimension as entries.");
        }

        this->solver = entries[0].solver;

        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }

        this->ind_type = indicies[0].type;
        this->entry_type = entries[0].type;

        cvc5::Sort ind_sort = indicies[0].term.getSort();
        cvc5::Sort entry_sort = entries[0].term.getSort();
        cvc5::Sort Array = this->solver->term_manager.mkArraySort(ind_sort, entry_sort);
        if (name.empty()) {
            this->term = this->solver->term_manager.mkConst(Array);
        } else {
            this->term = this->solver->term_manager.mkConst(Array, name);
        }

        for (size_t i = 0; i < indicies.size(); i++) {
            this->term =
                this->solver->term_manager.mkTerm(cvc5::Kind::STORE, { this->term, indicies[i].term, entries[i].term });
        }
    }

    /**
     * @brief Construct a new Symbolic Array object
     *
     * @details Creates a vector-like array with constant integer indicies
     *
     * @param entries vector of symbolic entries
     * @param index_base example of an index. Needed to extract the sort out of STerm
     * @param name name of the resulting symbolic variable, defaults to var_{i}
     */
    SymArray(const std::vector<sym_entry>& entries, const STerm& index_base, const std::string& name = "")
        : ind_type(index_base.type)
    {
        if (entries.size() == 0) {
            throw std::invalid_argument("Empty vector occured during SymArray initialization");
        }
        this->solver = entries[0].solver;

        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }

        this->entry_type = entries[0].type;

        cvc5::Sort ind_sort = index_base.term.getSort();
        cvc5::Sort entry_sort = entries[0].term.getSort();
        cvc5::Sort Array = this->solver->term_manager.mkArraySort(ind_sort, entry_sort);
        if (name.empty()) {
            this->term = this->solver->term_manager.mkConst(Array);
        } else {
            this->term = this->solver->term_manager.mkConst(Array, name);
        }

        for (size_t i = 0; i < entries.size(); i++) {
            STerm idx = STerm::Const(i, this->solver, this->ind_type);
            this->term = this->solver->term_manager.mkTerm(cvc5::Kind::STORE, { this->term, idx, entries[i] });
        }
    }

    sym_entry get(const sym_index& ind) const
    {
        cvc5::Term res_term = this->solver->term_manager.mkTerm(cvc5::Kind::SELECT, { this->term, ind.term });
        return { res_term, this->solver, this->entry_type };
    }

    sym_entry operator[](const sym_index& ind) const { return this->get(ind); }

    void put(const sym_index& ind, const sym_entry& entry)
    {
        this->term = this->solver->term_manager.mkTerm(cvc5::Kind::STORE, { this->term, ind.term, entry.term });
    }

    operator std::string() const { return this->solver->stringify_term(term); };
    operator cvc5::Term() const { return term; };

    void print_trace() const { this->solver->print_array_trace(this->term); }

    friend std::ostream& operator<<(std::ostream& out, const SymArray& term)
    {
        return out << static_cast<std::string>(term);
    };

    SymArray(const SymArray& other) = default;
    SymArray(SymArray&& other) = default;
    SymArray& operator=(const SymArray& right) = default;
    SymArray& operator=(SymArray&& right) = default;
    ~SymArray() = default;
};

/**
 * @brief symbolic Set class
 *
 * @details allows to group separate STerms in one place
 * and perform inclusion operations
 * Compatible parameters:
 * STerm
 * Bool
 * STuple
 * SymArray
 * SymSet
 */
template <ConstructibleFromTerm sym_entry> class SymSet {
  private:
  public:
    Solver* solver;
    cvc5::Term term;

    TermType type = TermType::SymSet;
    TermType entry_type;

    SymSet()
        : solver(nullptr)
        , term(cvc5::Term())
        , entry_type(TermType::FFTerm){};

    SymSet(const cvc5::Term& term, Solver* s, TermType type = TermType::SymSet)
        : solver(s)
        , term(term)
        , type(type){};

    /**
     * @brief Construct a new empty Symbolic Set object
     *
     * @param entry_sort cvc5 sort
     * @param entry_type Symbolic term type
     * @param s  pointer to solver
     * @param name name of the resulting symbolic variable, defaults to var_{i}
     */
    SymSet(const cvc5::Sort& entry_sort, TermType entry_type, Solver* s, const std::string& name = "")
        : solver(s)
        , entry_type(entry_type)
    {
        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }

        cvc5::Sort Array = this->solver->term_manager.mkSetSort(entry_sort);
        if (name.empty()) {
            this->term = this->solver->term_manager.mkConst(Array);
        } else {
            this->term = this->solver->term_manager.mkConst(Array, name);
        }
    }

    /**
     * @brief Construct a new Symbolic Set object
     *
     * @param entries vector of symbolic entries
     * @param name name of the resulting symbolic variable, defaults to var_{i}
     */
    SymSet(const std::vector<sym_entry>& entries, const std::string& name = "")
    {
        if (entries.size() == 0) {
            throw std::invalid_argument("Empty vector occured during SymSet initialization");
        }

        this->solver = entries[0].solver;
        if (!this->solver->lookup_enabled) {
            throw std::logic_error("You have to enable lookups during Solver initialization");
        }

        this->entry_type = entries[0].type;

        cvc5::Sort entry_sort = entries[0].term.getSort();
        cvc5::Sort SET = this->solver->term_manager.mkSetSort(entry_sort);
        if (name.empty()) {
            this->term = this->solver->term_manager.mkConst(SET);
        } else {
            this->term = this->solver->term_manager.mkConst(SET, name);
        }

        std::vector<cvc5::Term> terms_;
        terms_.reserve(entries.size() + 1);
        auto map = [](const sym_entry& t) -> cvc5::Term { return t.term; };
        std::transform(entries.begin(), entries.end(), std::back_inserter(terms_), map);

        terms_.push_back(this->term);
        this->term = this->solver->term_manager.mkTerm(cvc5::Kind::SET_INSERT, terms_);
    }

    void insert(const sym_entry& entry)
    {
        this->term = this->solver->term_manager.mkTerm(cvc5::Kind::SET_INSERT, { entry.term, this->term });
    }

    /**
     * @brief Create an inclusion constraint
     *
     * @param entry entry to be checked
     * @todo (alex) maybe it should return the term value, for bool comaptibility
     */
    void contains(const sym_entry& entry) const
    {
        // TODO(alex): Should use entry.normalize() here, but didn't come up with any quick solution
        // other than adding a SymbolicBase class or smth
        sym_entry left = entry;
        cvc5::Term inclusion = this->solver->term_manager.mkTerm(cvc5::Kind::SET_MEMBER, { entry.term, this->term });
        this->solver->assertFormula(inclusion);
    }

    /**
     * @brief Create an inclusion constraint
     *
     * @param entry entry to be checked
     */
    void not_contains(const sym_entry& entry) const
    {
        // TODO(alex): Should use entry.normalize() here, but didn't come up with any quick solution
        // other than adding a SymbolicBase class or smth
        sym_entry left = entry;
        cvc5::Term inclusion = this->solver->term_manager.mkTerm(cvc5::Kind::SET_MEMBER, { entry.term, this->term });
        cvc5::Term not_inclusion = this->solver->term_manager.mkTerm(cvc5::Kind::NOT, { inclusion });
        this->solver->assertFormula(not_inclusion);
    }

    operator std::string() const { return this->solver->stringify_term(term); };
    operator cvc5::Term() const { return term; };

    void print_trace() const { this->solver->print_set_trace(this->term); }

    friend std::ostream& operator<<(std::ostream& out, const SymSet& term)
    {
        return out << static_cast<std::string>(term);
    };

    SymSet(const SymSet& other) = default;
    SymSet(SymSet&& other) = default;
    SymSet& operator=(const SymSet& right) = default;
    SymSet& operator=(SymSet&& right) = default;
    ~SymSet() = default;
};

} // namespace smt_terms