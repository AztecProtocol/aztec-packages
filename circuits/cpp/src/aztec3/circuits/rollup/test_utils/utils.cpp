#include "utils.hpp"

#include "init.hpp"
#include "nullifier_tree_testing_harness.hpp"

#include "aztec3/circuits/abis/membership_witness.hpp"
#include "aztec3/circuits/abis/new_contract_data.hpp"
#include "aztec3/circuits/abis/rollup/root/root_rollup_public_inputs.hpp"
#include "aztec3/circuits/rollup/base/init.hpp"
#include "aztec3/constants.hpp"
#include <aztec3/circuits/kernel/private/utils.hpp>
#include <aztec3/circuits/mock/mock_kernel_circuit.hpp>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/merkle_tree/memory_store.hpp"
#include "barretenberg/stdlib/merkle_tree/merkle_tree.hpp"

#include <set>
#include <utility>
namespace {
using NT = aztec3::utils::types::NativeTypes;

using ConstantRollupData = aztec3::circuits::abis::ConstantRollupData<NT>;
using BaseRollupInputs = aztec3::circuits::abis::BaseRollupInputs<NT>;
using RootRollupInputs = aztec3::circuits::abis::RootRollupInputs<NT>;
using RootRollupPublicInputs = aztec3::circuits::abis::RootRollupPublicInputs<NT>;
using DummyComposer = aztec3::utils::DummyComposer;

using Aggregator = aztec3::circuits::recursion::Aggregator;
using AppendOnlyTreeSnapshot = aztec3::circuits::abis::AppendOnlyTreeSnapshot<NT>;
using KernelData = aztec3::circuits::abis::PreviousKernelData<NT>;

using NullifierLeafPreimage = aztec3::circuits::abis::NullifierLeafPreimage<NT>;

using MerkleTree = stdlib::merkle_tree::MemoryTree;
using NullifierTree = stdlib::merkle_tree::NullifierMemoryTree;
using NullifierLeaf = stdlib::merkle_tree::nullifier_leaf;
using MemoryStore = stdlib::merkle_tree::MemoryStore;
using SparseTree = stdlib::merkle_tree::MerkleTree<MemoryStore>;

using aztec3::circuits::abis::MembershipWitness;
using MergeRollupInputs = aztec3::circuits::abis::MergeRollupInputs<NT>;
using aztec3::circuits::abis::PreviousRollupData;

using nullifier_tree_testing_values = std::tuple<BaseRollupInputs, AppendOnlyTreeSnapshot, AppendOnlyTreeSnapshot>;

using aztec3::circuits::kernel::private_kernel::utils::dummy_previous_kernel;
}  // namespace

namespace aztec3::circuits::rollup::test_utils::utils {

// Want some helper functions for generating kernels with some commitments, nullifiers and contracts

std::vector<uint8_t> get_empty_calldata_leaf()
{
    auto const number_of_inputs =
        (KERNEL_NEW_COMMITMENTS_LENGTH + KERNEL_NEW_NULLIFIERS_LENGTH + KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH * 2 +
         KERNEL_NEW_L2_TO_L1_MSGS_LENGTH + KERNEL_NEW_CONTRACTS_LENGTH * 3) *
        2;
    auto const size = number_of_inputs * 32;
    std::vector<uint8_t> input_data(size, 0);
    return input_data;
}

KernelData get_empty_kernel()
{
    return dummy_previous_kernel();
}

std::array<fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP> get_empty_l1_to_l2_messages()
{
    std::array<fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP> l1_to_l2_messages = { 0 };
    return l1_to_l2_messages;
}

BaseRollupInputs base_rollup_inputs_from_kernels(std::array<KernelData, 2> kernel_data,
                                                 MerkleTree& private_data_tree,
                                                 MerkleTree& contract_tree,
                                                 SparseTree& public_data_tree,
                                                 MerkleTree& l1_to_l2_msg_tree)
{
    // @todo Look at the starting points for all of these.
    // By supporting as inputs we can make very generic tests, where it is trivial to try new setups.
    MerkleTree historic_private_data_tree = MerkleTree(PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT);
    MerkleTree historic_contract_tree = MerkleTree(CONTRACT_TREE_ROOTS_TREE_HEIGHT);
    MerkleTree historic_l1_to_l2_msg_tree = MerkleTree(L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT);

    // Historic trees are initialised with an empty root at position 0.
    historic_private_data_tree.update_element(0, private_data_tree.root());
    historic_contract_tree.update_element(0, contract_tree.root());
    historic_l1_to_l2_msg_tree.update_element(0, MerkleTree(L1_TO_L2_MSG_TREE_HEIGHT).root());

    ConstantRollupData const constantRollupData = {
        .start_tree_of_historic_private_data_tree_roots_snapshot = {
            .root = historic_private_data_tree.root(),
            .next_available_leaf_index = 1,
        },
        .start_tree_of_historic_contract_tree_roots_snapshot = {
            .root = historic_contract_tree.root(),
            .next_available_leaf_index = 1,
        },
        .start_tree_of_historic_l1_to_l2_msg_tree_roots_snapshot = {
            .root = historic_l1_to_l2_msg_tree.root(),
            .next_available_leaf_index = 1,
        },
    };

    for (size_t i = 0; i < 2; i++) {
        kernel_data[i].public_inputs.constants.historic_tree_roots.private_historic_tree_roots.private_data_tree_root =
            private_data_tree.root();
        kernel_data[i].public_inputs.constants.historic_tree_roots.private_historic_tree_roots.contract_tree_root =
            contract_tree.root();
        kernel_data[i]
            .public_inputs.constants.historic_tree_roots.private_historic_tree_roots.l1_to_l2_messages_tree_root =
            l1_to_l2_msg_tree.root();
    }

    BaseRollupInputs baseRollupInputs = { .kernel_data = kernel_data,
                                              .start_private_data_tree_snapshot = {
                                                  .root = private_data_tree.root(),
                                                  .next_available_leaf_index = 0,
                                              },
                                              .start_contract_tree_snapshot = {
                                                  .root = contract_tree.root(),
                                                  .next_available_leaf_index = 0,
                                              },
                                              .constants = constantRollupData };

    // Initialise nullifier tree with 0..7
    std::vector<fr> const initial_values = { 1, 2, 3, 4, 5, 6, 7 };

    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> nullifiers;
    for (size_t i = 0; i < 2; i++) {
        for (size_t j = 0; j < KERNEL_NEW_NULLIFIERS_LENGTH; j++) {
            nullifiers[i * 4 + j] = kernel_data[i].public_inputs.end.new_nullifiers[j];
        }
    }

    // TODO(lasse): It is a bit hacky here that it is always the same location we are inserting it.

    auto temp = generate_nullifier_tree_testing_values_explicit(baseRollupInputs, nullifiers, initial_values);
    baseRollupInputs = std::get<0>(temp);

    baseRollupInputs.new_contracts_subtree_sibling_path =
        get_sibling_path<CONTRACT_SUBTREE_INCLUSION_CHECK_DEPTH>(contract_tree, 0, CONTRACT_SUBTREE_DEPTH);

    baseRollupInputs.new_commitments_subtree_sibling_path =
        get_sibling_path<PRIVATE_DATA_SUBTREE_INCLUSION_CHECK_DEPTH>(private_data_tree, 0, PRIVATE_DATA_SUBTREE_DEPTH);


    // Update public data tree to generate sibling paths: we first set the initial public data tree to the result of all
    // public data reads and old_values from public data update requests. Note that, if the right tx reads or writes an
    // index that was already processed by the left one, we don't want to reflect that as part of the initial state, so
    // we skip those.
    std::set<uint256_t> visited_indices;
    for (size_t i = 0; i < 2; i++) {
        for (auto public_data_read : kernel_data[i].public_inputs.end.public_data_reads) {
            auto leaf_index = uint256_t(public_data_read.leaf_index);
            if (public_data_read.is_empty() || visited_indices.contains(leaf_index)) {
                continue;
            }
            visited_indices.insert(leaf_index);
            public_data_tree.update_element(leaf_index, public_data_read.value);
        }

        for (auto public_data_update_request : kernel_data[i].public_inputs.end.public_data_update_requests) {
            auto leaf_index = uint256_t(public_data_update_request.leaf_index);
            if (public_data_update_request.is_empty() || visited_indices.contains(leaf_index)) {
                continue;
            }
            visited_indices.insert(leaf_index);
            public_data_tree.update_element(leaf_index, public_data_update_request.old_value);
        }
    }

    baseRollupInputs.start_public_data_tree_root = public_data_tree.root();

    // Then we collect all sibling paths for the reads in the left tx, and then apply the update requests while
    // collecting their paths. And then repeat for the right tx.
    for (size_t i = 0; i < 2; i++) {
        for (size_t j = 0; j < KERNEL_PUBLIC_DATA_READS_LENGTH; j++) {
            auto public_data_read = kernel_data[i].public_inputs.end.public_data_reads[j];
            if (public_data_read.is_empty()) {
                continue;
            }
            auto leaf_index = uint256_t(public_data_read.leaf_index);
            baseRollupInputs.new_public_data_reads_sibling_paths[i * KERNEL_PUBLIC_DATA_READS_LENGTH + j] =
                MembershipWitness<NT, PUBLIC_DATA_TREE_HEIGHT>{
                    .leaf_index = public_data_read.leaf_index,
                    .sibling_path = get_sibling_path<PUBLIC_DATA_TREE_HEIGHT>(public_data_tree, leaf_index),
                };
        }

        for (size_t j = 0; j < KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH; j++) {
            auto public_data_update_request = kernel_data[i].public_inputs.end.public_data_update_requests[j];
            if (public_data_update_request.is_empty()) {
                continue;
            }
            auto leaf_index = uint256_t(public_data_update_request.leaf_index);
            public_data_tree.update_element(leaf_index, public_data_update_request.new_value);
            baseRollupInputs
                .new_public_data_update_requests_sibling_paths[i * KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH + j] =
                MembershipWitness<NT, PUBLIC_DATA_TREE_HEIGHT>{
                    .leaf_index = public_data_update_request.leaf_index,
                    .sibling_path = get_sibling_path<PUBLIC_DATA_TREE_HEIGHT>(public_data_tree, leaf_index),
                };
        }
    }

    // Get historic_root sibling paths
    baseRollupInputs.historic_private_data_tree_root_membership_witnesses[0] = {
        .leaf_index = 0,
        .sibling_path = get_sibling_path<PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>(historic_private_data_tree, 0, 0),
    };
    baseRollupInputs.historic_private_data_tree_root_membership_witnesses[1] =
        baseRollupInputs.historic_private_data_tree_root_membership_witnesses[0];

    baseRollupInputs.historic_contract_tree_root_membership_witnesses[0] = {
        .leaf_index = 0,
        .sibling_path = get_sibling_path<CONTRACT_TREE_ROOTS_TREE_HEIGHT>(historic_contract_tree, 0, 0),
    };
    baseRollupInputs.historic_contract_tree_root_membership_witnesses[1] =
        baseRollupInputs.historic_contract_tree_root_membership_witnesses[0];
    baseRollupInputs.historic_l1_to_l2_msg_tree_root_membership_witnesses[0] = {
        .leaf_index = 0,
        .sibling_path = get_sibling_path<L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT>(historic_l1_to_l2_msg_tree, 0, 0),
    };
    baseRollupInputs.historic_l1_to_l2_msg_tree_root_membership_witnesses[1] =
        baseRollupInputs.historic_l1_to_l2_msg_tree_root_membership_witnesses[0];

    return baseRollupInputs;
}

BaseRollupInputs base_rollup_inputs_from_kernels(std::array<KernelData, 2> kernel_data)
{
    MerkleTree private_data_tree = MerkleTree(PRIVATE_DATA_TREE_HEIGHT);
    MerkleTree contract_tree = MerkleTree(CONTRACT_TREE_HEIGHT);
    MerkleTree l1_to_l2_messages_tree = MerkleTree(L1_TO_L2_MSG_TREE_HEIGHT);

    MemoryStore public_data_tree_store;
    SparseTree public_data_tree(public_data_tree_store, PUBLIC_DATA_TREE_HEIGHT);

    return base_rollup_inputs_from_kernels(
        std::move(kernel_data), private_data_tree, contract_tree, public_data_tree, l1_to_l2_messages_tree);
}

std::array<PreviousRollupData<NT>, 2> get_previous_rollup_data(DummyComposer& composer,
                                                               std::array<KernelData, 4> kernel_data)
{
    // NOTE: Still assuming that this is first and second. Don't handle more rollups atm
    auto base_rollup_input_1 = base_rollup_inputs_from_kernels({ kernel_data[0], kernel_data[1] });
    auto base_public_input_1 =
        aztec3::circuits::rollup::native_base_rollup::base_rollup_circuit(composer, base_rollup_input_1);

    // Build the trees based on inputs in base_rollup_input_1.
    MerkleTree private_data_tree = MerkleTree(PRIVATE_DATA_TREE_HEIGHT);
    MerkleTree contract_tree = MerkleTree(CONTRACT_TREE_HEIGHT);
    std::vector<fr> initial_values = { 1, 2, 3, 4, 5, 6, 7 };
    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> nullifiers;

    for (size_t i = 0; i < 2; i++) {
        for (size_t j = 0; j < KERNEL_NEW_COMMITMENTS_LENGTH; j++) {
            private_data_tree.update_element(i * KERNEL_NEW_COMMITMENTS_LENGTH + j,
                                             kernel_data[i].public_inputs.end.new_commitments[j]);
        }
        auto contract_data = kernel_data[i].public_inputs.end.new_contracts[0];
        auto contract_leaf = crypto::pedersen_commitment::compress_native(
            { contract_data.contract_address, contract_data.portal_contract_address, contract_data.function_tree_root },
            GeneratorIndex::CONTRACT_LEAF);
        if (contract_data.contract_address != 0) {
            contract_tree.update_element(i, contract_leaf);
        }
        for (size_t j = 0; j < KERNEL_NEW_NULLIFIERS_LENGTH; j++) {
            initial_values.push_back(kernel_data[i].public_inputs.end.new_nullifiers[j]);
            nullifiers[i * KERNEL_NEW_NULLIFIERS_LENGTH + j] = kernel_data[2 + i].public_inputs.end.new_nullifiers[j];
        }
    }

    auto base_rollup_input_2 = base_rollup_inputs_from_kernels({ kernel_data[2], kernel_data[3] });
    auto temp = generate_nullifier_tree_testing_values_explicit(base_rollup_input_2, nullifiers, initial_values);
    base_rollup_input_2 = std::get<0>(temp);

    base_rollup_input_2.start_private_data_tree_snapshot = base_public_input_1.end_private_data_tree_snapshot;
    base_rollup_input_2.start_nullifier_tree_snapshot = base_public_input_1.end_nullifier_tree_snapshot;
    base_rollup_input_2.start_contract_tree_snapshot = base_public_input_1.end_contract_tree_snapshot;

    base_rollup_input_2.new_contracts_subtree_sibling_path =
        get_sibling_path<CONTRACT_SUBTREE_INCLUSION_CHECK_DEPTH>(contract_tree, 2, CONTRACT_SUBTREE_DEPTH);
    base_rollup_input_2.new_commitments_subtree_sibling_path =
        get_sibling_path<PRIVATE_DATA_SUBTREE_INCLUSION_CHECK_DEPTH>(private_data_tree, 8, PRIVATE_DATA_SUBTREE_DEPTH);

    auto base_public_input_2 =
        aztec3::circuits::rollup::native_base_rollup::base_rollup_circuit(composer, base_rollup_input_2);

    PreviousRollupData<NT> const previous_rollup1 = {
        .base_or_merge_rollup_public_inputs = base_public_input_1,
        .proof = kernel_data[0].proof,
        .vk = kernel_data[0].vk,
        .vk_index = 0,
        .vk_sibling_path = MembershipWitness<NT, ROLLUP_VK_TREE_HEIGHT>(),
    };
    PreviousRollupData<NT> const previous_rollup2 = {
        .base_or_merge_rollup_public_inputs = base_public_input_2,
        .proof = kernel_data[2].proof,
        .vk = kernel_data[2].vk,
        .vk_index = 0,
        .vk_sibling_path = MembershipWitness<NT, ROLLUP_VK_TREE_HEIGHT>(),
    };

    return { previous_rollup1, previous_rollup2 };
}

MergeRollupInputs get_merge_rollup_inputs(utils::DummyComposer& composer, std::array<KernelData, 4> kernel_data)
{
    MergeRollupInputs inputs = { .previous_rollup_data = get_previous_rollup_data(composer, std::move(kernel_data)) };
    return inputs;
}

RootRollupInputs get_root_rollup_inputs(utils::DummyComposer& composer,
                                        std::array<KernelData, 4> kernel_data,
                                        std::array<fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP> l1_to_l2_messages)
{
    MerkleTree historic_private_data_tree = MerkleTree(PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT);
    MerkleTree historic_contract_tree = MerkleTree(CONTRACT_TREE_ROOTS_TREE_HEIGHT);
    MerkleTree historic_l1_to_l2_msg_tree = MerkleTree(L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT);

    MerkleTree const private_data_tree = MerkleTree(PRIVATE_DATA_TREE_HEIGHT);
    MerkleTree const contract_tree = MerkleTree(CONTRACT_TREE_HEIGHT);
    MerkleTree l1_to_l2_msg_tree = MerkleTree(L1_TO_L2_MSG_TREE_HEIGHT);

    // Historic trees are initialised with an empty root at position 0.
    historic_private_data_tree.update_element(0, private_data_tree.root());
    historic_contract_tree.update_element(0, contract_tree.root());
    historic_l1_to_l2_msg_tree.update_element(0, l1_to_l2_msg_tree.root());

    auto historic_data_sibling_path =
        get_sibling_path<PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>(historic_private_data_tree, 1, 0);
    auto historic_contract_sibling_path =
        get_sibling_path<CONTRACT_TREE_ROOTS_TREE_HEIGHT>(historic_contract_tree, 1, 0);
    auto historic_l1_to_l2_msg_sibling_path =
        get_sibling_path<L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT>(historic_l1_to_l2_msg_tree, 1, 0);
    auto l1_to_l2_tree_sibling_path = get_sibling_path<L1_TO_L2_MSG_SUBTREE_INCLUSION_CHECK_DEPTH>(
        l1_to_l2_msg_tree, 0, L1_TO_L2_MSG_SUBTREE_INCLUSION_CHECK_DEPTH);

    // l1_to_l2_message tree snapshots
    AppendOnlyTreeSnapshot const start_l1_to_l2_msg_tree_snapshot = {
        .root = l1_to_l2_msg_tree.root(),
        .next_available_leaf_index = 0,
    };
    AppendOnlyTreeSnapshot const start_historic_tree_l1_to_l2_message_tree_roots_snapshot = {
        .root = historic_l1_to_l2_msg_tree.root(),
        .next_available_leaf_index = 1,
    };

    RootRollupInputs rootRollupInputs = {
        .previous_rollup_data = get_previous_rollup_data(composer, std::move(kernel_data)),
        .new_historic_private_data_tree_root_sibling_path = historic_data_sibling_path,
        .new_historic_contract_tree_root_sibling_path = historic_contract_sibling_path,
        .l1_to_l2_messages = l1_to_l2_messages,
        .new_l1_to_l2_message_tree_root_sibling_path = l1_to_l2_tree_sibling_path,
        .new_historic_l1_to_l2_message_roots_tree_sibling_path = historic_l1_to_l2_msg_sibling_path,
        .start_l1_to_l2_message_tree_snapshot = start_l1_to_l2_msg_tree_snapshot,
        .start_historic_tree_l1_to_l2_message_tree_roots_snapshot =
            start_historic_tree_l1_to_l2_message_tree_roots_snapshot,
    };
    return rootRollupInputs;
}

//////////////////////////
// NULLIFIER TREE BELOW //
//////////////////////////

/**
 * @brief Get initial nullifier tree object
 *
 * @param initial_values values to pre-populate the tree
 * @return NullifierMemoryTreeTestingHarness
 */
NullifierMemoryTreeTestingHarness get_initial_nullifier_tree(const std::vector<fr>& initial_values)
{
    NullifierMemoryTreeTestingHarness nullifier_tree = NullifierMemoryTreeTestingHarness(NULLIFIER_TREE_HEIGHT);
    for (const auto& initial_value : initial_values) {
        nullifier_tree.update_element(initial_value);
    }
    return nullifier_tree;
}

nullifier_tree_testing_values generate_nullifier_tree_testing_values(BaseRollupInputs inputs,
                                                                     size_t starting_insertion_value = 0,
                                                                     size_t spacing = 5)
{
    const size_t NUMBER_OF_NULLIFIERS = KERNEL_NEW_NULLIFIERS_LENGTH * 2;
    std::array<fr, NUMBER_OF_NULLIFIERS> nullifiers;
    for (size_t i = 0; i < NUMBER_OF_NULLIFIERS; ++i) {
        auto insertion_val = (starting_insertion_value + i * spacing);
        nullifiers[i] = fr(insertion_val);
    }

    // Generate initial values lin spaved
    std::vector<fr> initial_values;
    for (size_t i = 1; i < 8; ++i) {
        initial_values.emplace_back(i * spacing);
    }

    return utils::generate_nullifier_tree_testing_values_explicit(std::move(inputs), nullifiers, initial_values);
}

nullifier_tree_testing_values generate_nullifier_tree_testing_values(
    BaseRollupInputs inputs, std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> new_nullifiers, size_t spacing = 5)
{
    // Generate initial values lin spaced
    std::vector<fr> initial_values;
    for (size_t i = 1; i < 8; ++i) {
        initial_values.emplace_back(i * spacing);
    }

    return utils::generate_nullifier_tree_testing_values_explicit(std::move(inputs), new_nullifiers, initial_values);
}

nullifier_tree_testing_values generate_nullifier_tree_testing_values_explicit(
    BaseRollupInputs rollupInputs,
    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> new_nullifiers,
    const std::vector<fr>& initial_values)
{
    size_t const start_tree_size = initial_values.size() + 1;
    // Generate nullifier tree testing values
    NullifierMemoryTreeTestingHarness nullifier_tree = get_initial_nullifier_tree(initial_values);
    NullifierMemoryTreeTestingHarness reference_tree = get_initial_nullifier_tree(initial_values);

    AppendOnlyTreeSnapshot const nullifier_tree_start_snapshot = {
        .root = nullifier_tree.root(),
        .next_available_leaf_index = static_cast<uint32_t>(start_tree_size),
    };

    const size_t NUMBER_OF_NULLIFIERS = KERNEL_NEW_NULLIFIERS_LENGTH * 2;
    std::array<NullifierLeafPreimage, NUMBER_OF_NULLIFIERS> new_nullifier_leaves{};

    // Calculate the predecessor nullifier pre-images
    // Get insertion values
    std::vector<fr> insertion_values;
    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH> new_nullifiers_kernel_1{};
    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH> new_nullifiers_kernel_2{};

    for (size_t i = 0; i < NUMBER_OF_NULLIFIERS; ++i) {
        auto insertion_val = new_nullifiers[i];
        if (i < KERNEL_NEW_NULLIFIERS_LENGTH) {
            new_nullifiers_kernel_1[i] = insertion_val;
        } else {
            new_nullifiers_kernel_2[i - KERNEL_NEW_NULLIFIERS_LENGTH] = insertion_val;
        }
        insertion_values.push_back(insertion_val);
        reference_tree.update_element(insertion_val);
    }

    // Get the hash paths etc from the insertion values
    auto witnesses_and_preimages = nullifier_tree.circuit_prep_batch_insert(insertion_values);

    auto new_nullifier_leaves_preimages = std::get<0>(witnesses_and_preimages);
    auto new_nullifier_leaves_sibling_paths = std::get<1>(witnesses_and_preimages);
    auto new_nullifier_leave_indexes = std::get<2>(witnesses_and_preimages);

    // Create witness values from this
    std::array<MembershipWitness<NT, NULLIFIER_TREE_HEIGHT>, NUMBER_OF_NULLIFIERS> new_membership_witnesses{};
    for (size_t i = 0; i < NUMBER_OF_NULLIFIERS; i++) {
        // create an array of the witness from the depth
        std::array<fr, NULLIFIER_TREE_HEIGHT> witness_array{};
        std::copy(new_nullifier_leaves_sibling_paths[i].begin(),
                  new_nullifier_leaves_sibling_paths[i].end(),
                  witness_array.begin());

        MembershipWitness<NT, NULLIFIER_TREE_HEIGHT> const witness = {
            .leaf_index = static_cast<NT::uint32>(new_nullifier_leave_indexes[i]),
            .sibling_path = witness_array,
        };
        new_membership_witnesses[i] = witness;

        // Create circuit compatible preimages - issue created to remove this step
        NullifierLeafPreimage const preimage = {
            .leaf_value = new_nullifier_leaves_preimages[i].value,
            .next_index = NT::uint32(new_nullifier_leaves_preimages[i].nextIndex),
            .next_value = new_nullifier_leaves_preimages[i].nextValue,
        };
        new_nullifier_leaves[i] = preimage;
    }

    // Get expected root with subtrees inserted correctly
    // Expected end state
    AppendOnlyTreeSnapshot const nullifier_tree_end_snapshot = {
        .root = reference_tree.root(),
        .next_available_leaf_index = uint32_t(reference_tree.size()),
    };

    std::vector<fr> sibling_path = reference_tree.get_sibling_path(start_tree_size);
    std::array<fr, NULLIFIER_SUBTREE_INCLUSION_CHECK_DEPTH> sibling_path_array;

    // Chop the first 3 levels from the sibling_path
    sibling_path.erase(sibling_path.begin(), sibling_path.begin() + NULLIFIER_SUBTREE_DEPTH);
    std::copy(sibling_path.begin(), sibling_path.end(), sibling_path_array.begin());

    // Update our start state
    // Nullifier trees
    rollupInputs.start_nullifier_tree_snapshot = nullifier_tree_start_snapshot;
    rollupInputs.new_nullifiers_subtree_sibling_path = sibling_path_array;

    rollupInputs.kernel_data[0].public_inputs.end.new_nullifiers = new_nullifiers_kernel_1;
    rollupInputs.kernel_data[1].public_inputs.end.new_nullifiers = new_nullifiers_kernel_2;

    rollupInputs.low_nullifier_leaf_preimages = new_nullifier_leaves;
    rollupInputs.low_nullifier_membership_witness = new_membership_witnesses;

    return std::make_tuple(rollupInputs, nullifier_tree_start_snapshot, nullifier_tree_end_snapshot);
}

/**
 * @brief Compares a hash calculated within a circuit (made up of two field elements) against
 *        one generated natively, (32 bytes) and checks if they match
 *
 * @param field_hash
 * @param expected_hash
 * @return true
 * @return false
 */
bool compare_field_hash_to_expected(std::array<fr, 2> field_hash, std::array<uint8_t, 32> expected_hash)
{
    auto high_buffer = field_hash[0].to_buffer();
    auto low_buffer = field_hash[1].to_buffer();

    std::array<uint8_t, 32> field_expanded_hash;
    for (uint8_t i = 0; i < 16; ++i) {
        field_expanded_hash[i] = high_buffer[16 + i];
        field_expanded_hash[16 + i] = low_buffer[16 + i];
    }

    return expected_hash == field_expanded_hash;
}

}  // namespace aztec3::circuits::rollup::test_utils::utils
