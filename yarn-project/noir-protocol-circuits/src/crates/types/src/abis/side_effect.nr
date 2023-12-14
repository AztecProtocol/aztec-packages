use crate::constants::{GENERATOR_INDEX__SIDE_EFFECT};

struct SideEffect{
    value: Field,
    // counter is called "side_effect_counter" in david's PR
    counter: Field,
}

impl SideEffect {
    pub fn serialize(self) -> [Field; 2] {
        [self.value, self.counter]
    }

    pub fn deserialise(values: [Field; 2]) -> Self {
        Self {
            value: values[0],
            counter: values[1],
        }
    }
    pub fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator(
            self.serialize() , GENERATOR_INDEX__SIDE_EFFECT)
    }

    pub fn assert_is_empty(self){
        assert(self.is_empty());
    }

    pub fn is_empty(self) -> bool {
        (self.value == 0)
        & (self.counter == 0)
    }

    pub fn eq(self, side_effect: SideEffect) -> bool {
        (self.value == side_effect.value)
        & (self.counter == side_effect.counter)
    }

    pub fn empty() -> SideEffect {
        SideEffect {
            value: 0,
            counter: 0,
        }
    }
}

struct SideEffectLinkedToNoteHash{
    value: Field,
    note_hash: Field,
    counter: Field,
}

impl SideEffectLinkedToNoteHash{
    pub fn serialize(self) -> [Field; 3] {
        [self.value, self.note_hash, self.counter]
    }

    pub fn deserialise(values: [Field; 3]) -> Self {
        Self {
            value: values[0],
            note_hash: values[1],
            counter: values[2],
        }
    }

    pub fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator(
            self.serialize(),
        GENERATOR_INDEX__SIDE_EFFECT)
    }

    pub fn assert_is_empty(self){
        assert(self.is_empty());
    }

    pub fn is_empty(self) -> bool {
        (self.value == 0)
        &  (self.note_hash == 0)
        & (self.counter == 0)
    }

    pub fn eq(self, side_effect: SideEffectLinkedToNoteHash) -> bool {
        (self.value == side_effect.value)
            & (self.note_hash == side_effect.note_hash) 
            & (self.counter == side_effect.counter)
    }

    pub fn empty() -> SideEffectLinkedToNoteHash {
        SideEffectLinkedToNoteHash {
            value: 0,
            note_hash: 0,
            counter: 0,
        }
    }
}

// for nested calls - keep track of their side effect start/end, and verify
// that the start value is equal to what is passed in, and then resume
// outer call side effect counting using the returned end value
// we deviate from original implementation - no SideEffectWithRange, but now
// modify the CallRequest to include start/end counters directly
