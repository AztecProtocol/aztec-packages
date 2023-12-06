#[oracle(getPortalContractAddress)]
fn _get_portal_address(_contract_address: Address) -> Field {}

unconstrained pub fn get_portal_address(contract_address: Address) -> Field {
    let portal_address = _get_portal_address(contract_address);
    portal_address
}
