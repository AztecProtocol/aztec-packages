#include <concepts>
#include <gtest/gtest.h>

#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

using namespace bb;

// The Mega flavors constrain different subsets of the arithmetization: MegaKernelFlavor drops the lookup and
// non-native-field relations, MegaZKFlavor additionally drops elliptic and memory, MegaAppFlavor keeps only
// the return_data bus. Each flavor's circuits are built on an execution trace holding exactly what it
// constrains, and that trace is part of the builder's type -- so a gate no relation would constrain has no
// block to be appended to, and a circuit cannot be paired with a flavor that does not constrain it. Most of
// what follows is therefore checked at compile time; only the databus, whose column is selected by a runtime
// BusId, needs a runtime check.

// --- The flavor/builder correspondence -------------------------------------------------------------------

// Each flavor's prover takes circuits built for that flavor...
static_assert(std::constructible_from<ProverInstance_<MegaFlavor>, MegaCircuitBuilder&>);
static_assert(std::constructible_from<ProverInstance_<MegaKernelFlavor>, MegaKernelCircuitBuilder&>);
static_assert(std::constructible_from<ProverInstance_<MegaAppFlavor>, MegaAppCircuitBuilder&>);
static_assert(std::constructible_from<ProverInstance_<MegaZKFlavor>, MegaHidingKernelCircuitBuilder&>);

// ... and no other: a circuit built for one flavor cannot be proven with another, in either direction.
static_assert(!std::constructible_from<ProverInstance_<MegaKernelFlavor>, MegaCircuitBuilder&>);
static_assert(!std::constructible_from<ProverInstance_<MegaFlavor>, MegaKernelCircuitBuilder&>);
static_assert(!std::constructible_from<ProverInstance_<MegaAppFlavor>, MegaKernelCircuitBuilder&>);

// --- Blocks and gate-creation paths a reduced arithmetization does not have ------------------------------

// Expressed as concepts so that the checks below are substitution failures rather than hard errors: a
// requires-expression outside a template is evaluated immediately, and a missing member is then ill-formed.
template <typename Builder>
concept HasLookupBlock = requires(typename Builder::ExecutionTrace trace) { trace.lookup; };
template <typename Builder>
concept HasNnfBlock = requires(typename Builder::ExecutionTrace trace) { trace.nnf; };
template <typename Builder>
concept HasEllipticBlock = requires(typename Builder::ExecutionTrace trace) { trace.elliptic; };
template <typename Builder>
concept HasMemoryBlock = requires(typename Builder::ExecutionTrace trace) { trace.memory; };

// The dropped relations' blocks are absent, so their rows cannot exist at all.
static_assert(HasLookupBlock<MegaCircuitBuilder>);
static_assert(!HasLookupBlock<MegaKernelCircuitBuilder>);
static_assert(!HasNnfBlock<MegaKernelCircuitBuilder>);
static_assert(HasEllipticBlock<MegaKernelCircuitBuilder>);
static_assert(!HasEllipticBlock<MegaHidingKernelCircuitBuilder>);
static_assert(!HasMemoryBlock<MegaHidingKernelCircuitBuilder>);

// Plookup-backed gadgets (logic, sha256, keccak, aes, ...) bottom out in create_lookup_gate.
template <typename Builder>
concept CanCreateLookupGate =
    requires(Builder builder, plookup::BasicTable table, plookup::BasicTable::LookupEntry entry) {
        builder.create_lookup_gate(0, 0, 0, table, entry);
    };
static_assert(CanCreateLookupGate<MegaCircuitBuilder>);
static_assert(!CanCreateLookupGate<MegaKernelCircuitBuilder>);

// Bigfield arithmetic, whose gates are only materialized at finalization: the queue itself is unavailable, so
// the failure lands on the code that asked for the multiplication rather than at finalize time.
template <typename Builder>
concept CanQueueNonNativeFieldMultiplication =
    requires(Builder builder, non_native_partial_multiplication_witnesses<fr> witnesses) {
        builder.queue_partial_non_native_field_multiplication(witnesses);
    };
static_assert(CanQueueNonNativeFieldMultiplication<MegaCircuitBuilder>);
static_assert(!CanQueueNonNativeFieldMultiplication<MegaKernelCircuitBuilder>);

// Elliptic and memory gates in the hiding kernel.
template <typename Builder>
concept CanCreateEccAddGate = requires(Builder builder, ecc_add_gate_ gate) { builder.create_ecc_add_gate(gate); };
template <typename Builder>
concept CanCreateRomArray = requires(Builder builder) { builder.create_ROM_array(1); };
static_assert(CanCreateEccAddGate<MegaKernelCircuitBuilder>);
static_assert(!CanCreateEccAddGate<MegaHidingKernelCircuitBuilder>);
static_assert(!CanCreateRomArray<MegaHidingKernelCircuitBuilder>);

// --- The bilinear gate, which shares the arithmetic block with ordinary arith rows ---------------

// BilinearBatchedEq is the one dropped kind that is not a dropped block: MegaAvmFlavor omits
// BilinearOrBatchedEqCheckRelation while keeping the arithmetic block those rows live in. A bilinear
// row in a MegaAvm circuit would therefore reach the prover with populated wires, no gate selector,
// and no relation evaluating on it. Two independent facts rule that out.
static_assert(!MegaAvmCircuitBuilder::ExecutionTrace::has_gate_kind(GateKind::BilinearBatchedEq));

using MegaArithmeticBlock = decltype(MegaCircuitBuilder{}.blocks.arithmetic);
using MegaAvmArithmeticBlock = decltype(MegaAvmCircuitBuilder{}.blocks.arithmetic);

template <typename Block>
concept CanAppendBilinearGateRow =
    requires(Block block, typename Block::Row row) { block.template append_gate<GateKind::BilinearBatchedEq>(row); };
static_assert(CanAppendBilinearGateRow<MegaArithmeticBlock>);
static_assert(!CanAppendBilinearGateRow<MegaAvmArithmeticBlock>);

// 1. The gate cannot be created on that arithmetization: the only builder-level creator is
//    constrained away, so a circuit carrying such a row does not compile.
template <typename Builder>
concept CanCreateBilinearGate =
    requires(Builder builder, bilinear_batched_eq_gate_<fr> gate) { builder.create_bilinear_batched_eq_gate(gate); };
static_assert(CanCreateBilinearGate<MegaCircuitBuilder>);
static_assert(!CanCreateBilinearGate<MegaAvmCircuitBuilder>);

// 2. A circuit built on an arithmetization that *can* carry the gate cannot be handed to the AVM
//    flavor's prover, so the row cannot be smuggled in via a fuller builder either.
static_assert(std::constructible_from<ProverInstance_<MegaAvmFlavor>, MegaAvmCircuitBuilder&>);
static_assert(!std::constructible_from<ProverInstance_<MegaAvmFlavor>, MegaCircuitBuilder&>);

// --- The databus, whose column is chosen at runtime ------------------------------------------------------

class FlavorBuilderBindingTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using FF = MegaFlavor::FF;
};

TEST_F(FlavorBuilderBindingTests, AppBuilderRejectsCalldataBusContent)
{
    MegaAppCircuitBuilder builder;
    const uint32_t witness_idx = builder.add_variable(FF(42));

    EXPECT_THROW(builder.add_public_calldata(BusId::KERNEL_CALLDATA, witness_idx), std::runtime_error);
    // return_data is the one bus MegaAppFlavor constrains.
    EXPECT_NO_THROW(builder.add_public_return_data(witness_idx));
}

// A read gate lands in the busread block, which every databus-carrying arithmetization has; only the read
// call site knows which bus was read, so reads are checked independently of content.
TEST_F(FlavorBuilderBindingTests, AppBuilderRejectsCalldataBusRead)
{
    MegaAppCircuitBuilder builder;
    const uint32_t read_idx = builder.add_variable(FF(0));

    EXPECT_THROW(builder.read_calldata(BusId::KERNEL_CALLDATA, read_idx), std::runtime_error);
}

TEST_F(FlavorBuilderBindingTests, KernelBuilderAcceptsEveryBus)
{
    MegaKernelCircuitBuilder builder;
    const uint32_t witness_idx = builder.add_variable(FF(42));

    EXPECT_NO_THROW(builder.add_public_calldata(BusId::KERNEL_CALLDATA, witness_idx));
    EXPECT_NO_THROW(builder.add_public_return_data(witness_idx));
}

// A circuit legal under its flavor proves, exercising the whole path with the reduced trace.
TEST_F(FlavorBuilderBindingTests, KernelCircuitProves)
{
    MegaKernelCircuitBuilder builder;
    MockCircuits::add_arithmetic_gates(builder, /*num_gates=*/16);

    EXPECT_NO_THROW(ProverInstance_<MegaKernelFlavor>{ builder });
}
