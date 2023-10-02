#pragma once

namespace proof_system::baby_vm {

template <typename FF> struct VMOperation {
    bool add = false;
    bool mul = false;
    bool eq = false;
    bool reset = false;
    FF scalar;
};

} // namespace proof_system::baby_vm