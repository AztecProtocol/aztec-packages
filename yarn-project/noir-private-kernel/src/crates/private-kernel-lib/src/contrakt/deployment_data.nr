use crate::address::EthAddress;
use crate::point::Point;
use crate::constants;

struct ContractDeploymentData {
    deployer_public_key : Point,
    constructor_vk_hash : Field,
    function_tree_root : Field,
    contract_address_salt : Field,
    portal_contract_address : EthAddress,
}

impl ContractDeploymentData {
    
    fn assert_is_zero(self) {
        assert(self.constructor_vk_hash == 0);
        assert(self.function_tree_root == 0);
        assert(self.contract_address_salt == 0);
        assert(self.portal_contract_address.to_field() == 0);
        self.deployer_public_key.assert_is_zero();
    }

    // Hash(deployer_public_key.x, deployer_public_key.y, constructor_vk_hash,
    //        function_tree_root,    contract_address_salt, portal_contract_address.to_field())
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::CONTRACT_DEPLOYMENT_DATA;
        0
    }
}