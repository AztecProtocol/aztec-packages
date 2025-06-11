use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize};
use aztec::protocol_types::traits::ToField;

global ADMIN_FLAG: u64 = 1;
global MINTER_FLAG: u64 = 2;
global BLACKLIST_FLAG: u64 = 4;

pub struct UserFlags {
    is_admin: bool,
    is_minter: bool,
    is_blacklisted: bool,
}

impl Packable<1> for UserFlags {
    fn pack(self) -> [Field; 1] {
        let mut value: u64 = 0;

        if self.is_admin {
            value = value | ADMIN_FLAG;
        }

        if self.is_minter {
            value = value | MINTER_FLAG;
        }

        if self.is_blacklisted {
            value = value | BLACKLIST_FLAG;
        }

        [value.to_field()]
    }

    fn unpack(fields: [Field; 1]) -> Self {
        let value: u64 = fields[0] as u64;
        let is_admin = value & ADMIN_FLAG == ADMIN_FLAG;
        let is_minter = value & MINTER_FLAG == MINTER_FLAG;
        let is_blacklisted = value & BLACKLIST_FLAG == BLACKLIST_FLAG;

        Self { is_admin, is_minter, is_blacklisted }
    }
}

impl Eq for UserFlags {
    fn eq(self, other: Self) -> bool {
        (self.is_admin == other.is_admin)
            & (self.is_minter == other.is_minter)
            & (self.is_blacklisted == other.is_blacklisted)
    }
}

// We implement this as it is used when serializing the state variable into return values
// This is very inefficient if used to store the state variable.
// We are currently "abusing" that the `to_field` is called in the `scheduled_value_change`
// where we are using this value.
impl Serialize<3> for UserFlags {
    fn serialize(self) -> [Field; 3] {
        [self.is_admin.to_field(), self.is_minter.to_field(), self.is_blacklisted.to_field()]
        // [self.to_field()]
    }
}

// We implement this as it is required for other contracts to be able to "rebuild" the variable
// after having received the serialized value as a return-value
impl Deserialize<3> for UserFlags {
    fn deserialize(fields: [Field; 3]) -> Self {
        Self { is_admin: fields[0] != 0, is_minter: fields[1] != 0, is_blacklisted: fields[2] != 0 }
    }
}

mod test {
    use crate::types::roles::UserFlags;
    use aztec::protocol_types::traits::Packable;

    fn assert_packable(is_minter: bool, is_admin: bool, is_blacklisted: bool) {
        let flags = UserFlags { is_minter, is_admin, is_blacklisted };
        let converted = UserFlags::unpack(flags.pack());

        assert_eq(converted.is_minter, is_minter);
        assert_eq(converted.is_admin, is_admin);
        assert_eq(converted.is_blacklisted, is_blacklisted);
    }

    #[test]
    fn test_to_from_field() {
        assert_packable(false, false, false);
        assert_packable(false, false, true);

        assert_packable(false, true, false);
        assert_packable(false, true, true);

        assert_packable(true, false, false);
        assert_packable(true, false, true);

        assert_packable(true, true, false);
        assert_packable(true, true, true);
    }
}
