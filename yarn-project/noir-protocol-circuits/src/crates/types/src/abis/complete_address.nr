use crate::{
    address::{
        AztecAddress,
        PartialAddress,
    },
    grumpkin_point::GrumpkinPoint,
};

struct CompleteAddress {
    address : AztecAddress,
    public_key : GrumpkinPoint, 
    partial_address: PartialAddress,
}

impl CompleteAddress{
    fn assert_is_zero(self) {
        self.address.assert_is_zero();
        self.public_key.assert_is_zero();
        self.partial_address.assert_is_zero();
    }
    
    pub fn compute(public_key : GrumpkinPoint, contract_address_salt : Field, contract_class_id : Field, constructor_hash : Field) -> CompleteAddress {
        let partial_address = PartialAddress::compute(contract_address_salt, contract_class_id, constructor_hash);
        
        CompleteAddress{
            address : AztecAddress::compute(public_key, partial_address),
            public_key, 
            partial_address,
        }
    }
}
