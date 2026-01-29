#include "barretenberg/avm_fuzzer/mutations/fault_injection/fault_injection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/address_derivation.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/alu.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/bitwise.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/bytecode.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/calldata.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/class_id_derivation.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/data_copy.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/ecadd.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/gt.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/keccakf1600.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/merkle_check.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/poseidon.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/range_check.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/scalar_mul.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/sha256_compression.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/to_radix.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/update_check.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
using namespace bb::avm2::simulation;

void bb::avm2::fuzzer::fault_injection(EventsContainer& events, std::mt19937_64& rng)
{
    FaultInjectionEventOptions option = BASIC_FAULT_INJECTION_EVENT_CONFIGURATION.select(rng);
    switch (option) {
    case FaultInjectionEventOptions::AluEvent:
        fault_injection_alu(events, rng);
        break;
    case FaultInjectionEventOptions::BitwiseEvent:
        fault_injection_bitwise(events, rng);
        break;
    case FaultInjectionEventOptions::RangeCheckEvent:
        fault_injection_range_check(events, rng);
        break;
    case FaultInjectionEventOptions::GtEvent:
        fault_injection_gt(events, rng);
        break;
    case FaultInjectionEventOptions::EcaddEvent:
        fault_injection_ecadd(events, rng);
        break;
    case FaultInjectionEventOptions::EcaddMemoryEvent:
        fault_injection_ecadd_memory(events, rng);
        break;
    case FaultInjectionEventOptions::ScalarMulEvent:
        fault_injection_scalar_mul(events, rng);
        break;
    case FaultInjectionEventOptions::Poseidon2Event:
        fault_injection_poseidon(events, rng);
        break;
    case FaultInjectionEventOptions::ToRadixEvent:
        fault_injection_to_radix(events, rng);
        break;
    case FaultInjectionEventOptions::BytecodeEvent:
        fault_injection_bytecode(events, rng);
        break;
    case FaultInjectionEventOptions::MemoryEvent:
        fault_injection_memory(events, rng);
        break;
    case FaultInjectionEventOptions::AddressDerivationEvent:
        fault_injection_address_derivation(events, rng);
        break;
    case FaultInjectionEventOptions::ClassIdDerivationEvent:
        fault_injection_class_id_derivation(events, rng);
        break;
    case FaultInjectionEventOptions::Sha256CompressionEvent:
        fault_injection_sha256_compression(events, rng);
        break;
    case FaultInjectionEventOptions::KeccakF1600Event:
        fault_injection_keccakf1600(events, rng);
        break;
    case FaultInjectionEventOptions::DataCopyEvent:
        fault_injection_data_copy(events, rng);
        break;
    case FaultInjectionEventOptions::CalldataEvent:
        fault_injection_calldata(events, rng);
        break;
    case FaultInjectionEventOptions::UpdateCheckEvent:
        fault_injection_update_check(events, rng);
        break;
    case FaultInjectionEventOptions::MerkleCheckEvent:
        fault_injection_merkle_check(events, rng);
        break;
    }
}
