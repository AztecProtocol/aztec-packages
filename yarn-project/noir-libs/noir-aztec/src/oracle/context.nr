#[oracle(getPortalAddress)]
fn _get_portal_address() -> Field {}


unconstrained fn get_portal_address() -> Field {
    let portal_address = _get_portal_address();
    portal_address
}