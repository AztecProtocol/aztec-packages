//! Mock backend tests to verify infrastructure without BB binary
//!
//! These tests use the MockBackend from barretenberg-rs to verify
//! that the API infrastructure works without requiring the BB binary.

#[cfg(test)]
mod tests {
    use barretenberg_rs::{
        generated_types::{Blake2s, Command},
        mock_backend::MockBackend,
        BarretenbergApi, Fr,
    };

    #[test]
    fn test_mock_backend_infrastructure() {
        let backend = MockBackend::new();
        let mut api = BarretenbergApi::new(backend);

        // This should work with the mock backend
        let result = api.blake2s(b"test data");

        assert!(result.is_ok(), "Blake2s call should succeed with mock backend");

        let response = result.unwrap();
        assert_eq!(response.hash.len(), 32, "Hash should be 32 bytes");
    }

    #[test]
    fn test_fr_type() {
        let fr = Fr::from_u64(42);
        assert_eq!(fr.to_buffer().len(), 32);

        let fr2 = Fr::from_buffer_reduce(&[1, 2, 3, 4]);
        assert_eq!(fr2.0[0], 1);
        assert_eq!(fr2.0[1], 2);
    }

    #[test]
    fn test_command_serialization() {
        let cmd = Command::Blake2s(Blake2s::new(vec![1, 2, 3, 4]));

        let serialized = rmp_serde::to_vec(&vec![cmd]).unwrap();
        assert!(!serialized.is_empty());
    }
}
