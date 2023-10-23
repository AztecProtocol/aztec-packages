use crate::address::{Address, EthAddress};
use crate::utils;
use dep::aztec::constants_gen;

struct NewContractData {
    contract_address : Address,
    portal_contract_address : EthAddress,
    function_tree_root : Field,
}

impl NewContractData {
    pub fn is_empty(self) -> bool {
        (self.contract_address.to_field() == 0) & 
        (self.portal_contract_address.to_field() == 0) & 
        (self.function_tree_root ==0)
    }

    pub fn default() -> Self {
        Self {
            contract_address : Address::default(),
            portal_contract_address : EthAddress::default(),
            function_tree_root : 0,
        }
    }

    pub fn hash(self) -> Field {
        if self.is_empty() {
            0 // We want to return 0 here since the contract_address is zero
        } else {
            dep::std::hash::pedersen_with_separator([
                self.contract_address.to_field(),
                self.portal_contract_address.to_field(),
                self.function_tree_root,
            ], constants_gen::GENERATOR_INDEX__CONTRACT_LEAF)[0]
        }
    }
    
    // TODO(David): These were switched in the cpp code
    // Its quite confusing that true will select the rhs
    fn conditional_select(mut self, predicate : bool, other : NewContractData) {
        self.contract_address = Address::conditional_assign(predicate, other.contract_address, self.contract_address);
        self.portal_contract_address = EthAddress::conditional_assign(predicate, other.portal_contract_address, self.portal_contract_address);
        self.function_tree_root = utils::conditional_assign(predicate, other.function_tree_root, self.function_tree_root);
    }
}
