use dep::aztec::constants_gen::{MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL};
use dep::private_kernel_lib::address::{Address, EthAddress};
use dep::private_kernel_lib::utils::bounded_vec:BoundedVec;
use dep::private_kernel_lib::abis::call_stack_item::PublicCallStackItem;

struct PublicCallData {
    call_stack_item: PublicCallStackItem,
    public_call_stack_preimages: [PublicCallStackItem; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],

    proof: Proof,
    portal_contract_address: EthAddress,
    bytecode_hash: Field,

}