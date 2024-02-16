use crate::grumpkin_point::GrumpkinPoint;
use crate::transaction::tx_request::TxRequest;
use crate::address::{AztecAddress, EthAddress, PartialAddress, PublicKeysHash};
use crate::transaction::tx_context::TxContext;
use crate::abis::function_data::FunctionData;
use crate::abis::function_leaf_preimage::FunctionLeafPreimage;
use crate::contrakt::contract_deployment_data::ContractDeploymentData;
use crate::abis::function_selector::FunctionSelector;
use crate::hash::{compute_l2_to_l1_hash, sha256_to_field, hash_args};
use crate::abis::public_call_stack_item::PublicCallStackItem;
use crate::abis::public_circuit_public_inputs::PublicCircuitPublicInputs;
use crate::abis::side_effect::SideEffect;
use crate::contract_class::ContractClassId;
use crate::messaging::l2_to_l1_message::L2ToL1Message;

#[test]
fn compute_l2_l1_hash() {
    // All zeroes
    let hash_result = compute_l2_to_l1_hash(AztecAddress::from_field(0), 0, 0, L2ToL1Message::empty());
    assert(hash_result == 0x2266ac2f9f0c19c015239ef5ea85862fc6fac00db73779b220a4d49c4856c2e1);

    // Non-zero case
    let message = L2ToL1Message { recipient: EthAddress::from_field(3), content: 5 };
    let hash_result = compute_l2_to_l1_hash(AztecAddress::from_field(1), 2, 4, message);
    assert(hash_result == 0x0f24729168d4450a5681beafa5e3a899ac28bd17bf5a4877dab37bcd834e1634);
}

#[test]
fn smoke_sha256_to_field() {
    let full_buffer = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
        40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
        60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
        80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
        120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
        140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159
    ];
    let result = sha256_to_field(full_buffer);
    assert(result == 0x142a6d57007171f6eaa33d55976d9dbe739c889c8e920f115f7808dea184c718);
}
