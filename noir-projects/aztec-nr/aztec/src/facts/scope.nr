use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}, utils::reader::Reader};

// PXE decodes these discriminants, so their values are part of the oracle interface.
global ACCOUNT: u8 = 1;
global PUBLIC: u8 = 2;

/// The scope a fact collection belongs to.
///
/// A collection under an account scope is only accessible to executions where that account is in scope. A collection
/// under the public scope is shared by all accounts, so any execution of the contract can access it.
#[derive(Eq, Serialize)]
pub struct FactScope {
    // Noir has no enums, so this wraps a discriminant plus the account it names, zero for the public scope.
    kind: u8,
    account: AztecAddress,
}

impl FactScope {
    /// The scope of a single account.
    pub fn account(account: AztecAddress) -> Self {
        Self { kind: ACCOUNT, account }
    }

    /// The scope shared by all accounts.
    pub fn public() -> Self {
        Self { kind: PUBLIC, account: AztecAddress::zero() }
    }

    /// Validates raw parts, as deserialization must reject malformed values.
    fn from_parts(kind: Field, account: AztecAddress) -> Self {
        assert((kind == ACCOUNT as Field) | (kind == PUBLIC as Field), f"unrecognized fact scope kind: {kind}");
        assert(
            (kind == ACCOUNT as Field) | (account == AztecAddress::zero()),
            f"public fact scope must not name an account, got {account}",
        );
        Self { kind: kind as u8, account }
    }
}

impl Deserialize for FactScope {
    let N: u32 = 2;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_parts(fields[0], AztecAddress::deserialize([fields[1]]))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let kind = reader.read();
        let account = AztecAddress::stream_deserialize(reader);
        Self::from_parts(kind, account)
    }
}

mod test {
    use crate::protocol::{address::AztecAddress, traits::{Deserialize, FromField, Serialize}, utils::reader::Reader};
    use super::FactScope;

    #[test]
    fn scopes_roundtrip_through_serialization() {
        let account_scope = FactScope::account(AztecAddress::from_field(42));
        let public_scope = FactScope::public();

        assert(FactScope::deserialize(account_scope.serialize()) == account_scope);
        assert(FactScope::deserialize(public_scope.serialize()) == public_scope);
    }

    #[test]
    fn serializes_to_the_pxe_wire_layout() {
        assert_eq(FactScope::account(AztecAddress::from_field(42)).serialize(), [1, 42]);
        assert_eq(FactScope::public().serialize(), [2, 0]);
    }

    #[test(should_fail_with = "unrecognized fact scope kind")]
    fn deserializing_invalid_kind_fails() {
        let _ = FactScope::deserialize([99, 0]);
    }

    #[test(should_fail_with = "unrecognized fact scope kind")]
    fn deserializing_kind_that_overflows_u8_fails() {
        let _ = FactScope::deserialize([257, 0]);
    }

    #[test(should_fail_with = "unrecognized fact scope kind")]
    fn stream_deserializing_kind_that_overflows_u8_fails() {
        let mut reader = Reader::new([257, 0]);
        let _ = FactScope::stream_deserialize(&mut reader);
    }

    #[test(should_fail_with = "public fact scope must not name an account")]
    fn deserializing_public_scope_with_account_fails() {
        let _ = FactScope::deserialize([2, 42]);
    }
}
