use dep::protocol_types::address::{
    Address,
    EthAddress,
};

#[oracle(getPortalContractAddress)]
fn _get_portal_address(_contract_address: Address) -> EthAddress {}

unconstrained pub fn get_portal_address(contract_address: Address) -> EthAddress {
    let portal_address = _get_portal_address(contract_address);
    portal_address
}
