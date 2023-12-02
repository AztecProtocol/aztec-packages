use acvm::FieldElement;

/// Represents a collection of assignments in the form of field elements.
///
/// This struct acts as a convenient wrapper around a vector of `FieldElement`,
/// providing utility methods for common operations like serialization.
#[derive(Debug, Default)]
pub struct Assignments(Vec<FieldElement>);

impl Assignments {
    /// Serializes the assignments into a byte vector.
    ///
    /// The resulting byte vector begins with a 4-byte representation
    /// of the number of assignments, followed by the byte representation
    /// of each assignment in a big-endian format.
    ///
    /// # Returns
    ///
    /// A `Vec<u8>` containing the serialized form of the assignments.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buffer = Vec::new();

        let witness_len = self.0.len() as u32;
        buffer.extend_from_slice(&witness_len.to_be_bytes());

        for assignment in self.0.iter() {
            buffer.extend_from_slice(&assignment.to_be_bytes());
        }

        buffer
    }
}

impl From<Vec<FieldElement>> for Assignments {
    fn from(w: Vec<FieldElement>) -> Assignments {
        Assignments(w)
    }
}
