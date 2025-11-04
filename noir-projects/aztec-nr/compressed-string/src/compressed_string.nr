use dep::aztec::protocol_types::{
    traits::{Deserialize, Packable, Serialize},
    utils::field::field_from_bytes,
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/15968): Kill, refactor and/or relocate this.

/// Convenience struct for capturing a string of type `str<M>`, and converting it
/// into other basic Noir types. Notably: converts to `[Field; N]` or `[u8; M]`.
/// This particular conversion process tightly-packs the M bytes of the input `str`
/// into 31-byte chunks, with each chunk being put into a field.
/// Each field can store 31 characters, so N should be M/31 rounded up.
/// Can be used for longer strings that don't fit into a single field.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct CompressedString<let N: u32, let M: u32> {
    value: [Field; N],
}

impl<let N: u32, let M: u32> CompressedString<N, M> {
    // TODO: if we move this into the utils of aztecnr (as suggested by #15968),
    // we can adopt its existing `fields_from_bytes` conversion function,
    // instead of this duplicated logic here.
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

    // TODO: if we move this into the utils of aztecnr (as suggested by #15968),
    // we can adopt its existing `bytes_from_fields` conversion function,
    // instead of this duplicated logic here.
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
