use dep::aztec::state_vars::map::Map;
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialisation::TypeSerialisationInterface;
use dep::aztec::types::type_serialisation::field_serialisation::FieldSerialisationMethods;
use dep::aztec::types::type_serialisation::field_serialisation::FIELD_SERIALISED_LEN;
use dep::std::hash::pedersen;

// Utility struct used to easily get a "id" for a private user that sits in the same
// "space" as the public users.
// It help us to have a single mapping for collateral that have both public and private users.
struct Account {
    address: Field,
    secret: Field,
}

impl Account {
    fn new(
        address: Field,
        secret: Field
    ) -> Self {
        Self {
            address,
            secret
        }
    }

    fn key(self: Self) -> Field {
        pedersen([self.address, self.secret])[0]
    }
}



// Struct to be used to represent "totals". Generally, there should be one per asset.
// It stores the global values that are shared among all users, such as an accumulator
// and last time it was updated.
// In practice, it should also point to an oracle and have more fields related to 
// loan to value ratios and other things, but we did not have enough reads/writes for this.
struct Asset {
    interest_accumulator: u120,
    last_updated_ts: u120,
    loan_to_value: u120,
    oracle_address: Field,
}

global ASSET_SERIALISED_LEN: Field = 4;

// Right now we are wasting so many writes. If changing last_updated_ts
// we will end up rewriting all of them, wasting writes.
fn deserialiseAsset(fields: [Field; ASSET_SERIALISED_LEN]) -> Asset {
    Asset {
        interest_accumulator: fields[0] as u120,
        last_updated_ts: fields[1] as u120,
        loan_to_value: fields[2] as u120,
        oracle_address: fields[3],
    }
}

fn serialiseAsset(asset: Asset) -> [Field; ASSET_SERIALISED_LEN] {
    [asset.interest_accumulator as Field, asset.last_updated_ts as Field, asset.loan_to_value as Field, asset.oracle_address]
}

impl Asset {
    fn serialise (self: Self) -> [Field; ASSET_SERIALISED_LEN] {
        serialiseAsset(self)
    }
}

global AssetSerialisationMethods = TypeSerialisationInterface {
    deserialise: deserialiseAsset,
    serialise: serialiseAsset,
};

// Storage structure, containing all storage, and specifying what slots they use.
struct Storage {
    assets: Map<PublicState<Asset, ASSET_SERIALISED_LEN>>,
    collateral: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    static_debt: Map<PublicState<Field, FIELD_SERIALISED_LEN>>, // abusing keys very heavily
}

impl Storage {
    fn init() -> Self {
        Storage {
            assets: Map::new(1, |slot| PublicState::new(slot, AssetSerialisationMethods)),
            collateral: Map::new(2, |slot| PublicState::new(slot, FieldSerialisationMethods)),
            static_debt: Map::new(3, |slot| PublicState::new(slot, FieldSerialisationMethods)),
        }
    }
}