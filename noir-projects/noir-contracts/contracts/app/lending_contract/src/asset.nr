use aztec::protocol::{address::AztecAddress, traits::{Deserialize, FromField, Packable, Serialize, ToField}};
use std::meta::derive;

/// Struct to be used to represent "totals". Generally, there should be one per Asset.
/// It stores the global values that are shared among all users, such as an accumulator
/// and last time it was updated.
/// In practice, it should also point to an oracle and have more fields related to
/// loan to value ratios and other things, but we did not have enough reads/writes for this.
///
/// Note: Right now we are wasting so many writes. If changing last_updated_ts we will end
/// up rewriting all the values.
#[derive(Deserialize, Serialize)]
pub struct Asset {
    pub interest_accumulator: u128,
    pub last_updated_ts: u64,
    pub loan_to_value: u128,
    pub oracle: AztecAddress,
}

impl Packable for Asset {
    let N: u32 = 3;

    fn pack(self) -> [Field; Self::N] {
        [
            (self.interest_accumulator as Field) * 2.pow_32(64) + (self.last_updated_ts as Field),
            self.loan_to_value as Field,
            self.oracle.to_field(),
        ]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let last_updated_ts = packed[0] as u64;
        let interest_accumulator = ((packed[0] - last_updated_ts as Field) / 2.pow_32(64)) as u128;
        let loan_to_value = packed[1] as u128;
        let oracle = AztecAddress::from_field(packed[2]);
        Self { interest_accumulator, last_updated_ts, loan_to_value, oracle }
    }
}

mod test {
    use super::{Asset, AztecAddress, FromField, Packable};

    #[test]
    fn test_pack_unpack_asset() {
        let asset = Asset {
            interest_accumulator: 1000000,
            last_updated_ts: 1700000000,
            loan_to_value: 750000,
            oracle: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = Asset::unpack(asset.pack());
        assert_eq(unpacked.interest_accumulator, asset.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, asset.last_updated_ts);
        assert_eq(unpacked.loan_to_value, asset.loan_to_value);
        assert(unpacked.oracle.eq(asset.oracle));
    }

    #[test]
    fn test_pack_unpack_asset_zeros() {
        let asset = Asset {
            interest_accumulator: 0,
            last_updated_ts: 0,
            loan_to_value: 0,
            oracle: AztecAddress::from_field(0),
        };
        let unpacked = Asset::unpack(asset.pack());
        assert_eq(unpacked.interest_accumulator, 0);
        assert_eq(unpacked.last_updated_ts, 0);
        assert_eq(unpacked.loan_to_value, 0);
    }

    #[test]
    fn test_pack_unpack_asset_max() {
        let asset = Asset {
            interest_accumulator: 0xffffffffffffffffffffffffffffffff,
            last_updated_ts: 0xffffffffffffffff,
            loan_to_value: 0xffffffffffffffffffffffffffffffff,
            oracle: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = Asset::unpack(asset.pack());
        assert_eq(unpacked.interest_accumulator, asset.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, asset.last_updated_ts);
        assert_eq(unpacked.loan_to_value, asset.loan_to_value);
        assert(unpacked.oracle.eq(asset.oracle));
    }
}
