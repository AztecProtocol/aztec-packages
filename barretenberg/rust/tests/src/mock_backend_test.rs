//! Mock backend tests to verify infrastructure without BB binary

#[cfg(test)]
mod tests {
    use barretenberg_rs::{
        backend::Backend,
        error::Result,
        generated_types::*,
        BarretenbergApi,
    };

    /// Mock backend for testing without BB binary
    struct MockBackend {
        call_count: usize,
    }

    impl MockBackend {
        fn new() -> Self {
            Self { call_count: 0 }
        }
    }

    impl Backend for MockBackend {
        fn call(&mut self, _input: &[u8]) -> Result<Vec<u8>> {
            self.call_count += 1;

            // Return a mock Blake2s response
            let response = Response::Blake2sResponse(Blake2sResponse {
                hash: vec![0u8; 32],
            });

            rmp_serde::to_vec(&response)
                .map_err(|e| barretenberg_rs::error::BarretenbergError::Serialization(e.to_string()))
        }

        fn destroy(&mut self) -> Result<()> {
            Ok(())
        }
    }

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
        use barretenberg_rs::Fr;

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
