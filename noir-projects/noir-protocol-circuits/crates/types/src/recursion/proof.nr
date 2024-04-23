
use crate::{
    traits::{Serialize, Deserialize, Empty},
    constants::{ NON_RECURSIVE_PROOF_LENGTH, RECURSIVE_PROOF_LENGTH, NESTED_RECURSIVE_PROOF_LENGTH },
};


struct NonRecursiveProof {
    fields: [Field; NON_RECURSIVE_PROOF_LENGTH],
}

impl Serialize<NON_RECURSIVE_PROOF_LENGTH> for NonRecursiveProof {
    fn serialize(self) -> [Field; NON_RECURSIVE_PROOF_LENGTH] {
      let mut fields = [0; NON_RECURSIVE_PROOF_LENGTH];
      for i in 0..NON_RECURSIVE_PROOF_LENGTH {
        fields[i] = self.fields[i];
      }
      fields
    }
}

impl Deserialize<NON_RECURSIVE_PROOF_LENGTH> for NonRecursiveProof {
    fn deserialize(fields: [Field; NON_RECURSIVE_PROOF_LENGTH]) -> Self {
      let mut proof = NonRecursiveProof::empty();
      for i in 0..NON_RECURSIVE_PROOF_LENGTH {
        proof.fields[i] = fields[i];
      }
      proof
    }
}

impl Empty for NonRecursiveProof {
  fn empty() -> Self {
    NonRecursiveProof {
      fields: [0; NON_RECURSIVE_PROOF_LENGTH],
    }
  }
}

struct RecursiveProof {
    fields: [Field; RECURSIVE_PROOF_LENGTH],
}

impl Serialize<RECURSIVE_PROOF_LENGTH> for RecursiveProof {
    fn serialize(self) -> [Field; RECURSIVE_PROOF_LENGTH] {
      let mut fields = [0; RECURSIVE_PROOF_LENGTH];
      for i in 0..RECURSIVE_PROOF_LENGTH {
        fields[i] = self.fields[i];
      }
      fields
    }
}

impl Deserialize<RECURSIVE_PROOF_LENGTH> for RecursiveProof {
    fn deserialize(fields: [Field; RECURSIVE_PROOF_LENGTH]) -> Self {
      let mut proof = RecursiveProof::empty();
      for i in 0..RECURSIVE_PROOF_LENGTH {
        proof.fields[i] = fields[i];
      }
      proof
    }
}

impl Empty for RecursiveProof {
  fn empty() -> Self {
    RecursiveProof {
      fields: [0; RECURSIVE_PROOF_LENGTH],
    }
  }
}

struct NestedRecursiveProof {
    fields: [Field; NESTED_RECURSIVE_PROOF_LENGTH],
}

impl Serialize<NESTED_RECURSIVE_PROOF_LENGTH> for NestedRecursiveProof {
    fn serialize(self) -> [Field; NESTED_RECURSIVE_PROOF_LENGTH] {
      let mut fields = [0; NESTED_RECURSIVE_PROOF_LENGTH];
      for i in 0..NESTED_RECURSIVE_PROOF_LENGTH {
        fields[i] = self.fields[i];
      }
      fields
    }
}

impl Deserialize<NESTED_RECURSIVE_PROOF_LENGTH> for NestedRecursiveProof {
    fn deserialize(fields: [Field; NESTED_RECURSIVE_PROOF_LENGTH]) -> Self {
      let mut proof = NestedRecursiveProof::empty();
      for i in 0..NESTED_RECURSIVE_PROOF_LENGTH {
        proof.fields[i] = fields[i];
      }
      proof
    }
}

impl Empty for NestedRecursiveProof {
  fn empty() -> Self {
    NestedRecursiveProof {
      fields: [0; NESTED_RECURSIVE_PROOF_LENGTH],
    }
  }
}
