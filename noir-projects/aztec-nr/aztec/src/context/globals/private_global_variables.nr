use dep::protocol_types::traits::Serialize;

global PRIVATE_GLOBAL_VARIABLES_LENGTH: u64 = 2;

// docs:start:private-global-variables
struct PrivateGlobalVariables {
    chain_id: Field,
    version: Field,
}
// docs:end:private-global-variables

impl Default for PrivateGlobalVariables {
    fn default() -> Self {
        PrivateGlobalVariables {
            chain_id: 0,
            version: 0,
        }
    }
}

// Note: public global vars are equal to the private ones 
impl Serialize<PRIVATE_GLOBAL_VARIABLES_LENGTH> for PrivateGlobalVariables {
    fn serialize(self) -> [Field; PRIVATE_GLOBAL_VARIABLES_LENGTH] {
        [self.chain_id, self.version]
    }
}
