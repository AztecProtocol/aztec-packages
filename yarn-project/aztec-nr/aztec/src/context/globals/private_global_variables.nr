use dep::protocol_types::traits::Serialize;

// docs:start:private-global-variables
struct PrivateGlobalVariables {
    chain_id: Field,
    version: Field,
}
// docs:end:private-global-variables

impl Serialize<2> for PrivateGlobalVariables {
    fn serialize(self) -> [Field; 2] {
        [self.chain_id, self.version]
    }
}
