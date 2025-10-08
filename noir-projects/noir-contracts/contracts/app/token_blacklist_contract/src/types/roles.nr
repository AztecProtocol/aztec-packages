use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize, ToField};
use std::meta::derive;

global ADMIN_FLAG: u64 = 1;
global MINTER_FLAG: u64 = 2;
global BLACKLIST_FLAG: u64 = 4;

#[derive(Deserialize, Eq, Serialize)]
pub struct UserFlags {
    pub is_admin: bool,
    pub is_minter: bool,
    pub is_blacklisted: bool,
}

impl Packable for UserFlags {
    let N: u32 = 1;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
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

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        let value: u64 = fields[0] as u64;
        let is_admin = value & ADMIN_FLAG == ADMIN_FLAG;
        let is_minter = value & MINTER_FLAG == MINTER_FLAG;
        let is_blacklisted = value & BLACKLIST_FLAG == BLACKLIST_FLAG;

        Self { is_admin, is_minter, is_blacklisted }
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
