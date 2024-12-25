pub struct NoteTypeId(u8);

impl NoteTypeId {
    // Constructor that checks if the value fits within 7 bits
    pub fn new(id: u8) -> Result<Self, &'static str> {
        if id > 0x7F { // 0x7F = 0b01111111 (7 bits)
            return Err("NoteTypeId must fit in 7 bits");
        }
        Ok(Self(id))
    }

    // Serialization to bytes (1 byte instead of 32)
    pub fn to_bytes(&self) -> [u8; 1] {
        [self.0]
    }

    // Deserialization from bytes
    pub fn from_bytes(bytes: [u8; 1]) -> Result<Self, &'static str> {
        Self::new(bytes[0])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_note_type_id_validation() {
        // Valid values (7 bits)
        assert!(NoteTypeId::new(0).is_ok());
        assert!(NoteTypeId::new(127).is_ok());
        
        // Invalid values (>7 bits)
        assert!(NoteTypeId::new(128).is_err());
        assert!(NoteTypeId::new(255).is_err());
    }

    #[test]
    fn test_serialization() {
        let id = NoteTypeId::new(42).unwrap();
        let bytes = id.to_bytes();
        assert_eq!(bytes.len(), 1);
        
        let decoded = NoteTypeId::from_bytes(bytes).unwrap();
        assert_eq!(decoded.0, 42);
    }
}
