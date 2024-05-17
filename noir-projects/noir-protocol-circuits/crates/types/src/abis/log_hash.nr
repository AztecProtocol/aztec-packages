use crate::{
    abis::side_effect::{Ordered, OrderedValue}, address::AztecAddress,
    constants::{LOG_HASH_LENGTH, NOTE_LOG_HASH_LENGTH, SCOPED_LOG_HASH_LENGTH},
    traits::{Empty, Serialize, Deserialize}, utils::{arrays::array_concat, reader::Reader}
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

impl LogHash {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedLogHash {
        ScopedLogHash { log_hash: self, contract_address }
    }
}

struct ScopedLogHash {
    log_hash: LogHash,
    contract_address: AztecAddress,
}

impl Ordered for ScopedLogHash {
    fn counter(self) -> u32 {
        self.log_hash.counter
    }
}

impl OrderedValue<Field> for ScopedLogHash {
    fn value(self) -> Field {
        self.log_hash.value
    }
    fn counter(self) -> u32 {
        self.log_hash.counter
    }
}

impl Eq for ScopedLogHash {
    fn eq(self, other: ScopedLogHash) -> bool {
        (self.log_hash == other.log_hash)
            & (self.contract_address == other.contract_address) 
    }
}

impl Empty for ScopedLogHash {
    fn empty() -> Self {
        ScopedLogHash {
            log_hash: LogHash::empty(),
            contract_address: AztecAddress::empty(),
        }
    }
}

impl Serialize<SCOPED_LOG_HASH_LENGTH> for ScopedLogHash {
    fn serialize(self) -> [Field; SCOPED_LOG_HASH_LENGTH] {
       array_concat(self.log_hash.serialize(), [self.contract_address.to_field()])
    }
}

impl Deserialize<SCOPED_LOG_HASH_LENGTH> for ScopedLogHash {
    fn deserialize(values: [Field; SCOPED_LOG_HASH_LENGTH]) -> Self {
        let mut reader = Reader::new(values);
        let res = Self {
            log_hash: reader.read_struct(LogHash::deserialize),
            contract_address: reader.read_struct(AztecAddress::deserialize),
        };
        reader.finish();
        res
    }
}

struct NoteLogHash {
    value: Field,
    counter: u32,
    length: Field,
    note_hash_counter: u32,
}

impl NoteLogHash {
    pub fn expose_to_public(self) -> NoteLogHash {
        // Hide the actual counter and note hash counter when exposing it to the public kernel.
        // The counter is usually note_hash.counter + 1, so it can be revealing.
        NoteLogHash { value: self.value, counter: 0, length: self.length, note_hash_counter: 0 }
    }
}

impl Ordered for NoteLogHash {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl OrderedValue<Field> for NoteLogHash {
    fn value(self) -> Field {
        self.value
    }
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for NoteLogHash {
    fn eq(self, other: NoteLogHash) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter)
            & (self.length == other.length) 
            & (self.note_hash_counter == other.note_hash_counter) 
    }
}

impl Empty for NoteLogHash {
    fn empty() -> Self {
        NoteLogHash {
            value: 0,
            counter: 0,
            length: 0,
            note_hash_counter: 0,
        }
    }
}

impl Serialize<NOTE_LOG_HASH_LENGTH> for NoteLogHash {
    fn serialize(self) -> [Field; NOTE_LOG_HASH_LENGTH] {
        [self.value, self.counter as Field, self.length, self.note_hash_counter as Field]
    }
}

impl Deserialize<NOTE_LOG_HASH_LENGTH> for NoteLogHash {
    fn deserialize(values: [Field; NOTE_LOG_HASH_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
            length: values[2],
            note_hash_counter: values[3] as u32,
        }
    }
}
