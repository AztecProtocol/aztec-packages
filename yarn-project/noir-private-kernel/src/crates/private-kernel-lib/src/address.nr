use crate::utils;

// Aztec address
struct Address{
    inner : Field
}

impl Address{

    fn default() -> Address {
        Address {
            inner : 0
        }
    }

    fn to_field(self) -> Field{
        self.inner
    }
    
    fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }

    fn conditional_assign(predicate: bool, lhs : Address, rhs : Address) -> Address{
        let result = utils::conditional_assign(predicate, rhs.to_field(), lhs.to_field());
        Address {
            inner : result
        }
    }

    fn eq(self, other : Address) -> bool {
        self.to_field() == other.to_field()
    }
}

// TODO(David): The cpp code uses Fr for portal_contract_address
// This is a divergence from the cpp code.
struct EthAddress{
    inner : Field
}

impl EthAddress{

    fn default() -> Address {
        Address {
            inner : 0
        }
    }

    fn to_field(self) -> Field{
        self.inner
    }

    fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }

    fn conditional_assign(predicate: bool, lhs : EthAddress, rhs : EthAddress) -> EthAddress{
        let result = utils::conditional_assign(predicate, rhs.to_field(), lhs.to_field());
        EthAddress {
            inner : result
        }
    }

    fn eq(self, other : EthAddress) -> bool {
        self.to_field() == other.to_field()
    }
}

