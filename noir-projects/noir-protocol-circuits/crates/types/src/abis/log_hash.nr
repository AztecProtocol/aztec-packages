use crate::{
    abis::side_effect::{Ordered, OrderedValue},
    constants::LOG_HASH_LENGTH,
    traits::{Empty, Serialize, Deserialize}
};

struct LogHash {
    value: Field,
    counter: u32,
    length: Field,
}

impl Ordered for LogHash {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl OrderedValue<Field> for LogHash {
    fn value(self) -> Field {
        self.value
    }
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for LogHash {
    fn eq(self, other: LogHash) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter)
            & (self.length == other.length) 
    }
}

impl Empty for LogHash {
    fn empty() -> Self {
        LogHash {
            value: 0,
            counter: 0,
            length: 0,
        }
    }
}

impl Serialize<LOG_HASH_LENGTH> for LogHash {
    fn serialize(self) -> [Field; LOG_HASH_LENGTH] {
        [self.value, self.counter as Field, self.length]
    }
}

impl Deserialize<LOG_HASH_LENGTH> for LogHash {
    fn deserialize(values: [Field; LOG_HASH_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
            length: values[2],
        }
    }
}