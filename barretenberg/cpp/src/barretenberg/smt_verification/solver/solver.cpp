#include "solver.hpp"
#include <iostream>

namespace smt_solver {

/**
 * Check if the system is solvable.
 *
 * @return true if the system is solvable.
 * */
bool Solver::check()
{
    cvc5::Result result = this->s.checkSat();
    this->res = result.isSat();
    this->checked = true;
    return this->res;
}

/**
 * If the system is solvable, extract the values for the given symbolic variables.
 *
 * @param terms A map containing pairs (name, symbolic term).
 * @return A map containing pairs (name, value).
 * */
std::unordered_map<std::string, std::string> Solver::model(std::unordered_map<std::string, cvc5::Term>& terms) const
{
    if (!this->checked) {
        throw std::length_error("Haven't checked yet");
    }
    if (!this->res) {
        throw std::length_error("There's no solution");
    }
    std::unordered_map<std::string, std::string> resulting_model;
    for (auto& term : terms) {
        cvc5::Term val = this->s.getValue(term.second);
        std::string str_val;
        if(val.isIntegerValue()){
            str_val = val.getIntegerValue();
        }else if(val.isFiniteFieldValue()){
            str_val = val.getFiniteFieldValue();
        }else{
            throw std::invalid_argument("Expected Integer or FiniteField sorts. Got: " + val.getSort().toString());
        }
        resulting_model.insert({ term.first, str_val });
    }
    return resulting_model;
}

/**
 * If the system is solvable, extract the values for the given symbolic variables.
 *
 * @param terms A vector containing symbolic terms.
 * @return A map containing pairs (variable name, value).
 * */
std::unordered_map<std::string, std::string> Solver::model(std::vector<cvc5::Term>& terms) const{
    if (!this->checked) {
        throw std::length_error("Haven't checked yet");
    }
    if (!this->res) {
        throw std::length_error("There's no solution");
    }
    std::unordered_map<std::string, std::string> resulting_model;
    for(auto& term: terms){
        cvc5::Term val = this->s.getValue(term);
        std::string str_val;
        if(val.isIntegerValue()){
            str_val = val.getIntegerValue();
        }else if(val.isFiniteFieldValue()){
            str_val = val.getFiniteFieldValue();
        }else{
            throw std::invalid_argument("Expected Integer or FiniteField sorts. Got: " + val.getSort().toString());
        }
        resulting_model.insert({term.toString(), str_val});
    }
    return resulting_model;
}

std::string stringify_term(const cvc5::Term& term){
    if(term.getKind() == cvc5::Kind::CONSTANT){
        return term.toString();
    }
    if(term.getKind() == cvc5::Kind::CONST_FINITE_FIELD){
        return term.getFiniteFieldValue();
    }
    if(term.getKind() == cvc5::Kind::CONST_INTEGER){
        return term.getIntegerValue();
    }
    if(term.getKind() == cvc5::Kind::CONST_BOOLEAN){
        return std::to_string(static_cast<size_t>(term.getBooleanValue()));
    }

    std::string res;
    std::string op;
    switch (term.getKind()){
        case cvc5::Kind::ADD:
        case cvc5::Kind::FINITE_FIELD_ADD:
            op = " + ";
            break;
        case cvc5::Kind::SUB:
            op = " - ";
            break;
        case cvc5::Kind::NEG:
        case cvc5::Kind::FINITE_FIELD_NEG:
            res = "- ";
            break;
        case cvc5::Kind::MULT:
        case cvc5::Kind::FINITE_FIELD_MULT:
            op = " * ";
            break;

        case cvc5::Kind::EQUAL:
            op = " == ";
            break;
        case cvc5::Kind::LT:
            op = " < ";
            break;
        case cvc5::Kind::GT:
            op = " > ";
            break;
        case cvc5::Kind::LEQ:
            op = " <= ";
            break;
        case cvc5::Kind::GEQ:
            op = " >= ";
            break;
        case cvc5::Kind::XOR:
            op = " ^ ";
            break;
        case cvc5::Kind::OR:
            op = " || ";
            break;
        case cvc5::Kind::AND:
            op = " && ";
            break;
        case cvc5::Kind::INTS_MODULUS:
            op = " % ";
            break;
        default:
            info("Invalid operand :", term.getKind());
            break;
    }// TODO(alex): a % b %...

    size_t i = 0;
    cvc5::Term child;
    for(const auto &t : term){
        if(i == term.getNumChildren() - 1){
            child = t;
            break;
        }
        res += stringify_term(t)+ op;
        i += 1;
    }
    
    return "(" + res + stringify_term(child) + ")";
}

/**
 * Output assertions in human readable format.
 *
 * */
void Solver::print_assertions() const {
    for(auto &t : this->s.getAssertions()){
        info(stringify_term(t));
    }
}
}; // namespace smt_solver
