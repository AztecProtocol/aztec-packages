#include "solver.hpp"
#include "barretenberg/common/log.hpp"

namespace smt_solver {

/**
 * Check if the system is solvable.
 *
 * @return true if the system is solvable.
 * */
bool Solver::check()
{
    cvc5::Result result = this->solver.checkSat();
    this->checked = true;
    this->cvc_result = result;

    if (result.isUnknown()) {
        info("Unknown Result");
    }
    this->res = result.isSat();
    return this->res;
}

/**
 * @brief Returns
 * - string value, if term is constant
 * - string value, if term is a variable and the model is ready
 *
 * @param term
 * @return string value of the term
 */
std::string Solver::get(const cvc5::Term& term) const
{
    if (term.getKind() == cvc5::Kind::CONST_FINITE_FIELD) {
        return term.getFiniteFieldValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_INTEGER) {
        return term.getIntegerValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_BITVECTOR) {
        return term.getBitVectorValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_BOOLEAN) {
        return std::to_string(static_cast<size_t>(term.getBooleanValue()));
    }

    if (!this->checked) {
        throw std::length_error("Haven't checked yet");
    }
    if (!this->res) {
        throw std::length_error("There's no solution");
    }

    cvc5::Term val = this->solver.getValue(term);
    std::string str_val;
    if (val.isIntegerValue()) {
        str_val = val.getIntegerValue();
    } else if (val.isFiniteFieldValue()) {
        str_val = val.getFiniteFieldValue();
    } else if (val.isBitVectorValue()) {
        str_val = val.getBitVectorValue();
    } else if (val.isBooleanValue()) {
        str_val = std::to_string(static_cast<size_t>(val.getBooleanValue()));
    } else {
        throw std::invalid_argument("Expected Integer or FiniteField sorts. Got: " + val.getSort().toString());
    }
    return str_val;
}

/**
 * If the system is solvable, extract the values for the given symbolic variables.
 * Specify the map to retrieve the values you need using the keys that are convenient for you.
 *
 * e.g. {"a": a}, where a is a symbolic term with the name "var78".
 * The return map will be {"a", value_of_a}
 *
 * @param terms A map containing pairs (name, symbolic term).
 * @return A map containing pairs (name, value).
 * */
std::unordered_map<std::string, std::string> Solver::model(std::unordered_map<std::string, cvc5::Term>& terms) const
{
    std::unordered_map<std::string, std::string> resulting_model;
    for (auto& term : terms) {
        resulting_model.insert({ term.first, this->get(term.second) });
    }
    return resulting_model;
}

/**
 * If the system is solvable, extract the values for the given symbolic variables.
 * The return map will contain the resulting values, which are available by the
 * names of the corresponding symbolic variable.
 *
 * e.g. if the input vector is {a} and a it is a term with name var78,
 * it will return {"var78": value_of_var78}
 *
 * @param terms A vector containing symbolic terms.
 * @return A map containing pairs (variable name, value).
 * */
std::unordered_map<std::string, std::string> Solver::model(std::vector<cvc5::Term>& terms) const
{
    std::unordered_map<std::string, std::string> resulting_model;
    for (auto& term : terms) {
        resulting_model.insert({ term.toString(), this->get(term) });
    }
    return resulting_model;
}

/**
 * @brief print the trace of array assigments up to previously printed ones
 *
 * @param term array term
 * @param is_head end of the recursion indicator
 * @return std::pair<std::string, size_t> pair: array_name, current_depth
 */
std::pair<std::string, size_t> Solver::print_array_trace(const cvc5::Term& term, bool is_head)
{
    bool is_store = term.getKind() == cvc5::Kind::STORE;
    bool is_array = term.getSort().isArray() && term.getKind() == cvc5::Kind::CONSTANT;
    if (!is_store && !is_array) {
        throw std::invalid_argument("Expected ARRAY or STORE. Got: " + term.toString());
    };

    if (term.getSort().isArray() && term.getKind() == cvc5::Kind::CONSTANT) {
        std::string arr_name = term.toString();
        if (!this->cached_array_traces.contains(arr_name)) {
            this->cached_array_traces.insert({ arr_name, 0 });
        }
        return { term.toString(), 1 };
    }
    auto [arr_name, cur_depth] = print_array_trace(term[0], /*is_head=*/false);
    if (this->cached_array_traces[arr_name] < cur_depth) {
        info(arr_name, "[", stringify_term(term[1]), "] = ", stringify_term(term[2]));
    }
    if (is_head) {
        this->cached_array_traces[arr_name] = cur_depth;
    }
    return { arr_name, cur_depth + 1 };
}

/**
 * @brief recover the array name from the nested assigments
 *
 * @param term array term
 * @return std::string array name
 */
std::string Solver::get_array_name(const cvc5::Term& term)
{
    bool is_store = term.getKind() == cvc5::Kind::STORE;
    bool is_array = term.getSort().isArray() && term.getKind() == cvc5::Kind::CONSTANT;
    if (!is_store && !is_array) {
        throw std::invalid_argument("Expected ARRAY or STORE. Got: " + term.toString());
    };

    if (term.getKind() == cvc5::Kind::STORE) {
        return get_array_name(term[0]);
    }
    return stringify_term(term);
}

/**
 * @brief print the trace of SET insertions up to previously printed ones
 *
 * @param term set term
 * @param is_head end of the recursion indicator
 * @return std::pair<std::string, size_t> pair: set_name, current_depth
 */
std::pair<std::string, size_t> Solver::print_set_trace(const cvc5::Term& term, bool is_head)
{
    bool is_insert = term.getKind() == cvc5::Kind::SET_INSERT;
    bool is_set = term.getSort().isSet() && term.getKind() == cvc5::Kind::CONSTANT;
    if (!is_insert && !is_set) {
        throw std::invalid_argument("Expected ARRAY or STORE. Got: " + term.toString());
    };

    if (term.getSort().isSet() && term.getKind() == cvc5::Kind::CONSTANT) {
        std::string set_name = term.toString();
        if (!this->cached_set_traces.contains(set_name)) {
            this->cached_set_traces.insert({ set_name, 0 });
        }
        return { term.toString(), 1 };
    }
    auto [set_name, cur_depth] = print_set_trace(term[term.getNumChildren() - 1], /*is_head=*/false);
    if (this->cached_set_traces[set_name] < cur_depth) {
        std::string res = stringify_term(term[term.getNumChildren() - 1]) + " <- {";

        size_t to_print = term.getNumChildren() > 257 ? 128 : term.getNumChildren() - 2;
        for (size_t i = 0; i < to_print; i++) {
            res += stringify_term(term[i]) + ", ";
        }
        if (to_print != term.getNumChildren() - 2) {
            res += "... , ";
        }
        res += stringify_term(term[term.getNumChildren() - 2]);
        res += "}";
        info(res);
    }
    if (is_head) {
        this->cached_set_traces[set_name] = cur_depth;
    }
    return { set_name, cur_depth + 1 };
}

/**
 * @brief recover the set name from the nested assigments
 *
 * @param term set term
 * @return std::string array name
 */
std::string Solver::get_set_name(const cvc5::Term& term)
{
    bool is_insert = term.getKind() == cvc5::Kind::SET_INSERT;
    bool is_set = term.getSort().isSet() && term.getKind() == cvc5::Kind::CONSTANT;
    if (!is_insert && !is_set) {
        throw std::invalid_argument("Expected SET or INSERT. Got: " + term.toString());
    };

    if (term.getKind() == cvc5::Kind::SET_INSERT) {
        return get_set_name(term[term.getNumChildren() - 1]);
    }
    return stringify_term(term);
}

/**
 * A simple recursive function that converts native smt language
 * to somewhat readable by humans.
 *
 * e.g. converts
 * (or (= a0 #b0000000000) (= a0 #b0000000001)) to ((a0 == 0) || (a0 == 1))
 * (= (* (+ a b) c) 10) to ((a + b) * c) == 10
 *
 * @param term cvc5 term.
 * @return Parsed term.
 * */
std::string Solver::stringify_term(const cvc5::Term& term, bool parenthesis)
{
    if (term.getKind() == cvc5::Kind::CONST_FINITE_FIELD) {
        return term.getFiniteFieldValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_INTEGER) {
        return term.getIntegerValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_BITVECTOR) {
        return term.getBitVectorValue();
    }
    if (term.getKind() == cvc5::Kind::CONST_BOOLEAN) {
        std::vector<std::string> bool_res = { "false", "true" };
        return bool_res[static_cast<size_t>(term.getBooleanValue())];
    }
    // handling tuples
    if (term.getSort().isTuple() && term.getKind() == cvc5::Kind::APPLY_CONSTRUCTOR) {
        std::string res = "(";
        for (size_t i = 1; i < term.getNumChildren() - 1; i++) {
            res += stringify_term(term[i]) + ", ";
        }
        res += stringify_term(term[term.getNumChildren() - 1]);
        return res + ")";
    }
    if (term.getKind() == cvc5::Kind::SET_EMPTY) {
        return "{}";
    }
    if (term.getKind() == cvc5::Kind::CONSTANT) {
        if (term.getSort().isSet()) {
            return "{" + term.toString() + "}";
        }
        if (term.getSort().isArray()) {
            return "[" + term.toString() + "]";
        }
        return term.toString();
    }

    std::string res;
    std::string op;
    bool child_parenthesis = true;
    bool back = false;
    switch (term.getKind()) {
    case cvc5::Kind::ADD:
    case cvc5::Kind::FINITE_FIELD_ADD:
    case cvc5::Kind::BITVECTOR_ADD:
        op = " + ";
        child_parenthesis = false;
        break;
    case cvc5::Kind::SUB:
    case cvc5::Kind::BITVECTOR_SUB:
        op = " - ";
        break;
    case cvc5::Kind::NEG:
    case cvc5::Kind::FINITE_FIELD_NEG:
    case cvc5::Kind::BITVECTOR_NEG:
        res = "-";
        break;
    case cvc5::Kind::MULT:
    case cvc5::Kind::FINITE_FIELD_MULT:
    case cvc5::Kind::BITVECTOR_MULT:
        op = " * ";
        break;
    case cvc5::Kind::EQUAL:
        op = " == ";
        child_parenthesis = false;
        break;
    case cvc5::Kind::LT:
    case cvc5::Kind::BITVECTOR_ULT:
        op = " < ";
        break;
    case cvc5::Kind::GT:
    case cvc5::Kind::BITVECTOR_UGT:
        op = " > ";
        break;
    case cvc5::Kind::LEQ:
    case cvc5::Kind::BITVECTOR_ULE:
        op = " <= ";
        break;
    case cvc5::Kind::GEQ:
    case cvc5::Kind::BITVECTOR_UGE:
        op = " >= ";
        break;
    case cvc5::Kind::BITVECTOR_UREM:
        op = " % ";
        break;
    case cvc5::Kind::BITVECTOR_UDIV:
        op = " / ";
        break;
    case cvc5::Kind::XOR:
    case cvc5::Kind::BITVECTOR_XOR:
        op = " ^ ";
        break;
    case cvc5::Kind::BITVECTOR_OR:
        op = " | ";
        break;
    case cvc5::Kind::OR:
        op = " || ";
        break;
    case cvc5::Kind::BITVECTOR_AND:
        op = " & ";
        break;
    case cvc5::Kind::BITVECTOR_SHL:
        op = " << ";
        break;
    case cvc5::Kind::BITVECTOR_LSHR:
        op = " >> ";
        break;
    case cvc5::Kind::BITVECTOR_ROTATE_LEFT:
        back = true;
        op = " ><< " + term.getOp()[0].toString();
        break;
    case cvc5::Kind::BITVECTOR_ROTATE_RIGHT:
        back = true;
        op = " >>< " + term.getOp()[0].toString();
        break;
    case cvc5::Kind::AND:
        op = " && ";
        break;
    case cvc5::Kind::NOT:
        res = "!";
        break;
    case cvc5::Kind::INTS_MODULUS:
        op = " % ";
        parenthesis = true;
        break;
    case cvc5::Kind::SET_INSERT:
        // Due to the specifics of sets implementation
        // We can't print all the INSERTs in place
        // In such case we will just return the array name
        return get_set_name(term[term.getNumChildren() - 1]);
    case cvc5::Kind::SET_MEMBER: {
        // On the other hand, here I'll be printing the whole trace of the set
        // initializations up to the previous print
        if (term.getNumChildren() != 2) {
            throw std::runtime_error("Expected set_member op. Got: " + term.toString());
        }
        std::string set_name = get_set_name(term[1]);
        print_set_trace(term[1]);
        std::string res = stringify_term(term[0], /*parenthesis=*/true) + " in " + set_name;
        if (parenthesis) {
            return "(" + res + ")";
        }
        return res;
    }
    case cvc5::Kind::STORE: {
        // Due to the specifics of arrays implementation
        // We can't print all the STOREs in place
        // In such case we will just return the array name
        return get_array_name(term[0]);
    }
    case cvc5::Kind::SELECT: {
        // On the other hand, here I'll be printing the whole trace of the array
        // initializations up to the previous print
        if (term.getNumChildren() != 2) {
            throw std::runtime_error("Expected SELECT op. Got: " + term.toString());
        }
        std::string res = get_array_name(term[0]);
        print_array_trace(term[0]);
        res += "[" + stringify_term(term[1]) + "]";
        return res;
    }
    default:
        info("\033[31m", "Unprocessed operand :", term.getKind(), "\033[0m");
        info("\033[31m", term, "\033[0m");
        return "failed to process";
    }

    for (size_t i = 0; i < term.getNumChildren() - 1; i++) {
        res += stringify_term(term[i], child_parenthesis) + op;
    }
    cvc5::Term child = term[term.getNumChildren() - 1];

    res = res + stringify_term(child, child_parenthesis);
    if (back) {
        res += op;
    }
    if (parenthesis) {
        return "(" + res + ")";
    }
    return res;
}

/**
 * Output assertions in human readable format.
 *
 * */
void Solver::print_assertions()
{
    for (const auto& t : this->solver.getAssertions()) {
        info(this->stringify_term(t));
    }
}
}; // namespace smt_solver
