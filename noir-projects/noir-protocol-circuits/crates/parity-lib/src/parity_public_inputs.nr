use dep::types::{mocked::AggregationObject, traits::{Empty, Serialize, Deserialize}};

struct ParityPublicInputs {
    converted_root: Field,
    sha_root: Field, 
       
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs {                      
            converted_root: 0,
            sha_root: 0, 
        }
    }
}

impl Serialize<2> for ParityPublicInputs {
  fn serialize(self) -> [Field; 2] {
    let mut fields = [0; 2];
    fields[0] = self.converted_root;
    fields[1] = self.sha_root;
    fields
  }
}

impl Deserialize<2> for ParityPublicInputs {
  fn deserialize(fields: [Field; 2]) -> Self {
    ParityPublicInputs {
      converted_root: fields[0],
      sha_root: fields[1],
    }
  }
}
