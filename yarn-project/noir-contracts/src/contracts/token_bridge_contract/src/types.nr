struct AztecAddress {
  address: Field
}

impl AztecAddress {
  fn new(address: Field) -> Self {
    Self {
      address
    }
  }

  fn serialize(self: Self) -> [Field; 1] {
    [self.address]
  }

  fn deserialize(fields: [Field; 1]) -> Self {
    Self {
      address: fields[0]
    }
  }
}

struct EthereumAddress {
  address: Field
}

impl EthereumAddress {
  fn new(address: Field) -> Self {
    Self {
      address
    }
  }

  fn serialize(self: Self) -> [Field; 1] {
    [self.address]
  }

  fn deserialize(fields: [Field; 1]) -> Self {
    Self {
      address: fields[0]
    }
  }
}
