global ADMIN_FLAG: u120 = 1;
global MINTER_FLAG: u120 = 2;
global BLACKLIST_FLAG: u120 = 4;

struct UserFlags {
    is_admin: bool,
    is_minter: bool,
    is_blacklist: bool,
}

impl UserFlags {

  fn new(value: u120) -> Self {
    let is_admin = value & ADMIN_FLAG == ADMIN_FLAG;
    let is_minter = value & MINTER_FLAG == MINTER_FLAG;
    let is_blacklist = value & BLACKLIST_FLAG == BLACKLIST_FLAG;

    Self {
      is_admin,
      is_minter,
      is_blacklist,
    }
  }

  fn get_value(self) -> Field {
    let mut value = 0;

    if self.is_admin {
      value += ADMIN_FLAG;
    }

    if self.is_minter {
      value += MINTER_FLAG;
    }

    if self.is_blacklist {
      value += BLACKLIST_FLAG;
    }

    value as Field
  }

  fn set_admin(&mut self, is_admin: bool) {
    self.is_admin = is_admin;
  }

  fn set_minter(&mut self, is_minter: bool) {
    self.is_minter = is_minter;
  }

  fn set_blacklist(&mut self, is_blacklist: bool) {
    self.is_blacklist = is_blacklist;
  }

}