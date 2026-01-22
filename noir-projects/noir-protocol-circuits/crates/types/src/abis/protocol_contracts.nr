use crate::{
    address::aztec_address::AztecAddress,
    constants::{DOM_SEP__PROTOCOL_CONTRACTS, MAX_PROTOCOL_CONTRACTS},
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Serialize, ToField},
};

#[derive(Eq, Serialize, Deserialize)]
pub struct ProtocolContracts {
    derived_addresses: [AztecAddress; MAX_PROTOCOL_CONTRACTS],
}

global MAX_PROTOCOL_CONTRACTS_BIT_SIZE: u32 = 4; // ceil(log2(MAX_PROTOCOL_CONTRACTS)) - tested below.

impl ProtocolContracts {
    pub fn new(derived_addresses: [AztecAddress; MAX_PROTOCOL_CONTRACTS]) -> Self {
        Self { derived_addresses }
    }

    /// Checks if the given address is a protocol contract address.
    pub fn is_magic_protocol_contract_address(contract_address: AztecAddress) -> bool {
        // Address 0 is not a valid magic protocol contract address, so we loop from 1:
        let mut acc = 1;
        for i in 1..MAX_PROTOCOL_CONTRACTS + 1 {
            // If any `i` matches, then `acc` will collapse to `0`.
            acc *= (contract_address.to_field() - i as Field);
        }
        // If you think of acc as representing a polynomial (x - 1)*(x - 2)*(x - 3)*...*(x - 10)*(x - 11),
        // then this polynomial only has roots 1,2,3,...,10,11.
        acc == 0
    }

    pub fn assert_not_derived_protocol_contract_address(self, contract_address: AztecAddress) {
        for i in 0..self.derived_addresses.len() {
            let derived_address = self.derived_addresses[i];
            // At the time of writing, the unused elements at the rhs of the derived_addresses array are 0's.
            // We don't disallow the 0 address in this function, simply because this function
            // only seeks to disallow 'proper' derived protocol contract addresses (and because
            // several tests use the 0 address).
            if derived_address.inner != 0 {
                assert(
                    contract_address != derived_address,
                    "Attempting to execute a 'derived' protocol contract address. This is not allowed.",
                );
            }
        }
    }

    /// Obtains the derived address for the given magic protocol contract address.
    ///
    /// Important! This assumes that the caller has already validated that the address is indeed a magic protocol contract
    /// address by calling `is_magic_protocol_contract_address` first, because this function fails if the input
    /// address is not a valid magic protocol contract address.
    pub fn get_derived_address(
        self,
        magic_protocol_contract_address: AztecAddress,
    ) -> AztecAddress {
        // Address 0 is not a valid magic protocol contract address: the below range check will fail in that case (see tests).
        // For protocol contract address i, its actual address is stored in derived_addresses[i - 1].
        let magic_protocol_contract_address_as_field = magic_protocol_contract_address.to_field();
        let index_of_derived_address_as_field = magic_protocol_contract_address_as_field - 1; // underflow for input address 0 will be caught on the next line.
        // We established a new variable, which we assert to be smaller than a u32, so as to make
        // the `as u32` conversion cheaper.
        index_of_derived_address_as_field.assert_max_bit_size::<MAX_PROTOCOL_CONTRACTS_BIT_SIZE>();
        self.derived_addresses[index_of_derived_address_as_field as u32]
    }

    pub fn hash(self) -> Field {
        poseidon2_hash_with_separator(
            self.derived_addresses.map(|address| address.to_field()),
            DOM_SEP__PROTOCOL_CONTRACTS,
        )
    }
}

impl Empty for ProtocolContracts {
    fn empty() -> Self {
        Self { derived_addresses: [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS] }
    }
}

mod test {
    use crate::{
        abis::protocol_contracts::ProtocolContracts, address::aztec_address::AztecAddress,
        constants::MAX_PROTOCOL_CONTRACTS, traits::FromField,
    };
    use super::MAX_PROTOCOL_CONTRACTS_BIT_SIZE;

    #[test]
    fn test_max_protocol_contracts_bit_size() {
        assert(1 << MAX_PROTOCOL_CONTRACTS_BIT_SIZE >= MAX_PROTOCOL_CONTRACTS);
        assert(1 << (MAX_PROTOCOL_CONTRACTS_BIT_SIZE - 1) < MAX_PROTOCOL_CONTRACTS);
    }

    #[test]
    fn test_max_protocol_contracts_bit_size_lte_32() {
        assert(
            MAX_PROTOCOL_CONTRACTS_BIT_SIZE <= 32,
            "You need to update the logic of get_derived_address, because the range check is no longer sufficient",
        );
    }

    #[test]
    fn test_is_magic_protocol_contract_address_valid() {
        // Protocol contract addresses are 1 through MAX_PROTOCOL_CONTRACTS
        for i in 1..MAX_PROTOCOL_CONTRACTS + 1 {
            let addr = AztecAddress::from_field(i as Field);
            assert(
                ProtocolContracts::is_magic_protocol_contract_address(addr),
                "Address should be a protocol contract",
            );
        }
    }

    #[test]
    fn test_is_magic_protocol_contract_address_zero_is_not_valid() {
        // Address 0 is not a protocol contract
        let addr = AztecAddress::from_field(0);
        assert(
            !ProtocolContracts::is_magic_protocol_contract_address(addr),
            "Address 0 should not be a protocol contract",
        );
    }

    #[test]
    fn test_is_magic_protocol_contract_address_above_max_is_not_valid() {
        // Addresses above MAX_PROTOCOL_CONTRACTS are not protocol contracts
        let addr = AztecAddress::from_field((MAX_PROTOCOL_CONTRACTS + 1) as Field);
        assert(
            !ProtocolContracts::is_magic_protocol_contract_address(addr),
            "Address above MAX should not be a protocol contract",
        );

        let large_addr = AztecAddress::from_field(1000);
        assert(
            !ProtocolContracts::is_magic_protocol_contract_address(large_addr),
            "Large address should not be a protocol contract",
        );
    }

    #[test]
    fn test_get_derived_address() {
        // Create an instance of ProtocolContracts with test derived addresses:
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        for i in 0..MAX_PROTOCOL_CONTRACTS {
            addresses[i] = AztecAddress::from_field((i + 100) as Field);
        }

        let contracts = ProtocolContracts::new(addresses);

        // Protocol contract address 1 maps to derived_addresses[0]
        // Protocol contract address 2 maps to derived_addresses[1]
        // etc.
        for i in 1..MAX_PROTOCOL_CONTRACTS + 1 {
            let protocol_addr = AztecAddress::from_field(i as Field);
            let derived = contracts.get_derived_address(protocol_addr);
            assert_eq(derived, AztecAddress::from_field((i - 1 + 100) as Field));
        }
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_get_derived_address_zero_fails() {
        // Create an instance of ProtocolContracts with test derived addresses:
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        for i in 0..MAX_PROTOCOL_CONTRACTS {
            addresses[i] = AztecAddress::from_field((i + 100) as Field);
        }
        let contracts = ProtocolContracts::new(addresses);

        // This will attempt to access the `derived_addresses` at index `-1`, which is out of bounds.
        let protocol_addr = AztecAddress::from_field(0);
        let _ = contracts.get_derived_address(protocol_addr);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn test_get_derived_address_above_max_fails() {
        // Create an instance of ProtocolContracts with test derived addresses:
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        for i in 0..MAX_PROTOCOL_CONTRACTS {
            addresses[i] = AztecAddress::from_field((i + 100) as Field);
        }
        let contracts = ProtocolContracts::new(addresses);

        // This will attempt to access the `derived_addresses` at index `MAX_PROTOCOL_CONTRACTS`, which is out of bounds.
        let protocol_addr = AztecAddress::from_field((MAX_PROTOCOL_CONTRACTS + 1) as Field);
        let _ = contracts.get_derived_address(protocol_addr);
    }

    #[test]
    fn test_assert_not_derived_protocol_contract_address_passes_for_non_derived() {
        // Create ProtocolContracts with some derived addresses
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        addresses[0] = AztecAddress::from_field(100);
        addresses[1] = AztecAddress::from_field(200);
        addresses[2] = AztecAddress::from_field(300);
        let contracts = ProtocolContracts::new(addresses);

        // A non-derived address should pass
        let non_derived_address = AztecAddress::from_field(999);
        contracts.assert_not_derived_protocol_contract_address(non_derived_address);
    }

    #[test]
    fn test_assert_not_derived_protocol_contract_address_allows_zero_address() {
        // Create ProtocolContracts with some derived addresses
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        addresses[0] = AztecAddress::from_field(100);
        addresses[1] = AztecAddress::from_field(200);
        let contracts = ProtocolContracts::new(addresses);

        // Zero address is explicitly allowed (see function comment)
        let zero_address = AztecAddress::zero();
        contracts.assert_not_derived_protocol_contract_address(zero_address);
    }

    #[test(should_fail_with = "Attempting to execute a 'derived' protocol contract address")]
    fn test_assert_not_derived_protocol_contract_address_fails_for_derived() {
        // Create ProtocolContracts with some derived addresses
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        addresses[0] = AztecAddress::from_field(100);
        addresses[1] = AztecAddress::from_field(200);
        addresses[2] = AztecAddress::from_field(300);
        let contracts = ProtocolContracts::new(addresses);

        // Using a derived address should fail
        let derived_address = AztecAddress::from_field(200);
        contracts.assert_not_derived_protocol_contract_address(derived_address);
    }

    #[test(should_fail_with = "Attempting to execute a 'derived' protocol contract address")]
    fn test_assert_not_derived_protocol_contract_address_fails_for_first_derived() {
        // Create ProtocolContracts with some derived addresses
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        addresses[0] = AztecAddress::from_field(100);
        addresses[1] = AztecAddress::from_field(200);
        let contracts = ProtocolContracts::new(addresses);

        // Using the first derived address (index 0) should fail
        let first_derived = AztecAddress::from_field(100);
        contracts.assert_not_derived_protocol_contract_address(first_derived);
    }

    #[test(should_fail_with = "Attempting to execute a 'derived' protocol contract address")]
    fn test_assert_not_derived_protocol_contract_address_fails_for_last_derived() {
        // Create ProtocolContracts with derived addresses spread across the array
        let mut addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
        addresses[0] = AztecAddress::from_field(100);
        addresses[MAX_PROTOCOL_CONTRACTS - 1] = AztecAddress::from_field(999);
        let contracts = ProtocolContracts::new(addresses);

        // Using the last derived address should fail
        let last_derived = AztecAddress::from_field(999);
        contracts.assert_not_derived_protocol_contract_address(last_derived);
    }

    #[test]
    fn test_assert_not_derived_protocol_contract_address_passes_when_all_zeros() {
        // When all derived addresses are zero, any non-zero address should pass
        let contracts = ProtocolContracts::new([AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS]);

        let any_address = AztecAddress::from_field(12345);
        contracts.assert_not_derived_protocol_contract_address(any_address);
    }
}
