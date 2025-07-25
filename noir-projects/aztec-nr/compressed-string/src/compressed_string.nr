use dep::aztec::protocol_types::{traits::{Deserialize, Serialize}, utils::field::field_from_bytes};

// The general Compressed String.
// Compresses M bytes into N fields.
// Can be used for longer strings that don't fit in a single field.
// Each field can store 31 characters, so N should be M/31 rounded up.
pub struct CompressedString<let N: u32, let M: u32> {
    value: [Field; N],
}

impl<let N: u32, let M: u32> CompressedString<N, M> {
    pub fn from_string(input_string: str<M>) -> Self {
        let mut fields = [0; N];
        let byts = input_string.as_bytes();

        let mut r_index = 0 as u32;

        for i in 0..N {
            let mut temp = [0 as u8; 31];
            for j in 0..31 {
                if r_index < M {
                    temp[j] = byts[r_index];
                    r_index += 1;
                }
            }

            fields[i] = field_from_bytes(temp, true);
        }

        Self { value: fields }
    }

    pub fn to_bytes(self) -> [u8; M] {
        let mut result = [0; M];
        let mut w_index = 0 as u32;
        for i in 0..N {
            let bytes: [u8; 31] = self.value[i].to_be_bytes();
            for j in 0..31 {
                if w_index < M {
                    result[w_index] = bytes[j];
                    w_index += 1;
                }
            }
        }
        result
    }
}

impl<let N: u32, let M: u32> Eq for CompressedString<N, M> {
    fn eq(self, other: CompressedString<N, M>) -> bool {
        self.value == other.value
    }
}

impl<let N: u32, let M: u32> Serialize for CompressedString<N, M> {
    let N: u32 = N;

    fn serialize(self) -> [Field; Self::N] {
        self.value
    }
}

impl<let N: u32, let M: u32> Deserialize for CompressedString<N, M> {
    let N: u32 = N;

    fn deserialize(input: [Field; Self::N]) -> Self {
        Self { value: input }
    }
}

#[test]
unconstrained fn test_short_string() {
    let i = "Hello world";
    let b = i.as_bytes();
    let name: CompressedString<1, 11> = CompressedString::from_string(i);
    let p = b == name.to_bytes();
    assert(p, "invalid recover");
}

#[test]
unconstrained fn test_long_string() {
    let i = "Hello world. I'm setting up a very long text of blibbablubb such that we can see if works as planned for longer names.";
    let b = i.as_bytes();
    let name: CompressedString<4, 118> = CompressedString::from_string(i);
    let p = b == name.to_bytes();
    assert(p, "invalid recover");
}

#[test]
unconstrained fn test_long_string_work_with_too_many_fields() {
    let i = "Hello world. I'm setting up a very long text of blibbablubb such that we can see if works as planned for longer names.";
    let b = i.as_bytes();
    let name: CompressedString<5, 118> = CompressedString::from_string(i);
    let p = b == name.to_bytes();
    assert(p, "invalid recover");
}

#[test]
unconstrained fn test_serde() {
    let i = "Hello world. I'm setting up a very long text of blibbablubb such that we can see if works as planned for longer names.";
    let name: CompressedString<5, 118> = CompressedString::from_string(i);

    assert_eq(name, CompressedString::deserialize(name.serialize()));
}

#[test(should_fail)]
unconstrained fn test_long_string_fail_with_too_few_fields() {
    let i = "Hello world. I'm setting up a very long text of blibbablubb such that we can see if works as planned for longer names.";
    let b = i.as_bytes();
    let name: CompressedString<3, 118> = CompressedString::from_string(i);
    let p = b == name.to_bytes();
    assert(p, "invalid recover");
}
