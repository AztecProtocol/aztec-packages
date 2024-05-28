#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIvcRecursiveVerifier_ {
  public:
    void verify(const ClientIVC::Proof& proof);
};
} // namespace bb::stdlib::recursion::honk