#include "smt_util.hpp"

bool smt_timer(smt_solver::Solver *s){
    auto start = std::chrono::high_resolution_clock::now();
    bool res = s->check();
    auto stop = std::chrono::high_resolution_clock::now();
    double duration = static_cast<double>(duration_cast<std::chrono::minutes>(stop - start).count());
    info("Time passed: ", duration);

    info(s->cvc_result);
    return res;
}