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

std::pair<std::vector<bb::fr>, std::vector<bb::fr>> base4(uint32_t el){
    std::vector<bb::fr> limbs;
    limbs.reserve(16);
    for(size_t i = 0; i < 16; i++){
        limbs.emplace_back(el % 4);
        el /= 4;
    }
    std::reverse(limbs.begin(), limbs.end());
    std::vector<bb::fr> accumulators;
    accumulators.reserve(16);
    bb::fr accumulator = 0;
    for(size_t i = 0; i < 16; i++){
        accumulator = accumulator * 4 + limbs[i];
        accumulators.emplace_back(accumulator);
    }
    std::reverse(limbs.begin(), limbs.end());
    std::reverse(accumulators.begin(), accumulators.end());
    return {limbs, accumulators};
}