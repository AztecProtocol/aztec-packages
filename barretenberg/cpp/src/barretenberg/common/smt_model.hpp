#include "barretenberg/smt_verification/circuit/circuit.hpp"

template<typename FF>
void default_model(std::vector<std::string> special, smt_circuit::Circuit<FF> &c1, smt_circuit::Circuit<FF> &c2, smt_solver::Solver *s){

    std::vector<cvc5::Term> vterms1;
    std::vector<cvc5::Term> vterms2;
    vterms1.reserve(c1.get_num_real_vars());
    vterms2.reserve(c1.get_num_real_vars());

    for(uint32_t i = 0; i < c1.get_num_vars(); i++){
        if(c1.real_variable_index[i] != i){
            continue;
        }
        vterms1.push_back(c1.symbolic_vars[i]);
        vterms2.push_back(c2.symbolic_vars[i]);
    }

    std::unordered_map<std::string, std::string> mmap1 = s->model(vterms1);
    std::unordered_map<std::string, std::string> mmap2 = s->model(vterms2);

    info("w12 = {");
    for(uint32_t i = 0; i < static_cast<uint32_t>(c1.symbolic_vars.size()); i++){
        std::string vname1 = c1[i];
        std::string vname2 = c2[i];
        info("{", mmap1[vname1], ", ", mmap2[vname2], "}", ",           //", vname1, ", ", vname2);
    }     
    info("};");

    std::unordered_map<std::string, cvc5::Term> vterms;    
    for(auto &vname: special){
        vterms.insert({vname + "_1", c1[vname]});
        vterms.insert({vname + "_2", c2[vname]});
    }

    std::unordered_map<std::string, std::string> mmap = s->model(vterms);
    for(auto &vname: special){
        info("// ", vname + "1", ", ", vname + "2", " = ", mmap[vname + "1"], ", ", mmap[vname + "2"]);
    }
}

template<typename FF>
void default_model_single(std::vector<std::string> special, smt_circuit::Circuit<FF> &c, smt_solver::Solver *s){
    std::vector<cvc5::Term> vterms;
    vterms.reserve(c.get_num_real_vars());

    for(uint32_t i = 0; i < c.get_num_vars(); i++){
        if(c.real_variable_index[i] != i){
            continue;
        }
        vterms.push_back(c.symbolic_vars[i]);
    }

    std::unordered_map<std::string, std::string> mmap = s->model(vterms);

    info("w = {");
    for(size_t i = 0; i < c.symbolic_vars.size(); i++){
        std::string vname = c[static_cast<uint32_t>(i)];
        info(mmap[vname], ",              //", vname);
    }     
    info("};");

    std::unordered_map<std::string, cvc5::Term> vterms1;    
    for(auto &vname: special){
        vterms1.insert({vname, c[vname]});
    }

    std::unordered_map<std::string, std::string> mmap1 = s->model(vterms);
    for(auto &vname: special){
        info("// ", vname, ": ", mmap1[vname]);
    }
}