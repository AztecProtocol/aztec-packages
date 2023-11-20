use crate::{
    abis::call_stack_item::PublicCallStackItem,
    address::EthAddress,
    mocked::Proof,
};

struct PublicCallData {
    call_stack_item: PublicCallStackItem,
    proof: Proof,
    portal_contract_address: EthAddress,
    bytecode_hash: Field,
}
