use crate::abis::complete_address::CompleteAddress;
use crate::point::Point;
use crate::transaction::request::TxRequest;
use crate::address::{Address, EthAddress};
use crate::transaction::context::TxContext;
use crate::abis::function_data::FunctionData;
use crate::contrakt::deployment_data::ContractDeploymentData;
use crate::abis::function_selector::FunctionSelector;

#[test]
fn compute_complete_address() {
    let point = Point{
        x : 1,
        y : 2
    };
    let contract_address_salt = 3;
    let function_tree_root = 4;
    let constructor_hash = 5;
        
    let complete_address = CompleteAddress::compute(point, contract_address_salt, function_tree_root, constructor_hash);
  
    assert(complete_address.partial_address == 0x2d21887e877530560476baa456091e3ec947feb8c80a8d8b271aca475b3d0d2f);
    assert(complete_address.address.to_field() == 0x0343055cb133a46b33e482843fc73f03697ee869f1786c1d15655a0ece4da1d4);
    assert(complete_address.public_key.x == 1);
    assert(complete_address.public_key.y == 2);
}


#[test]
fn compute_tx_request_hash() {
    let tx_request = TxRequest {
        origin : Address::from_field(1),
        args_hash : 3,
        tx_context : TxContext {
            is_fee_payment_tx : false,
            is_rebate_payment_tx : false,
            is_contract_deployment_tx : true,
            contract_deployment_data : ContractDeploymentData{
                deployer_public_key : Point{x : 1, y : 2},
                constructor_vk_hash : 1,
                function_tree_root : 2,
                contract_address_salt : 3,
                portal_contract_address : EthAddress::from_field(1),
            },
            chain_id : 0,
            version : 0,
        },
        function_data : FunctionData {
            selector : FunctionSelector::from_u32(2),
            is_internal : false,
            is_private : true,
            is_constructor : true,
        }
    };
    assert(tx_request.hash() == 0x030d01a52e494df23f5835c597bd53e194d5c27db185a720e55caa95561a1115);
}