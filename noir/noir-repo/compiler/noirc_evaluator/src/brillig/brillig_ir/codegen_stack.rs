use std::collections::HashMap;

use acvm::acir::brillig::MemoryAddress;

use super::BrilligContext;

impl BrilligContext {
    /// This function moves values from a set of registers to another set of registers.
    /// It first moves all sources to new allocated registers to avoid overwriting.
    pub(crate) fn codegen_mov_registers_to_registers(
        &mut self,
        sources: Vec<MemoryAddress>,
        destinations: Vec<MemoryAddress>,
    ) {
        assert!(
            sources.len() == destinations.len(),
            "Different sizes for sources and destinations"
        );

        let mut written_at = HashMap::new();

        for (position, destination) in destinations.iter().enumerate() {
            assert!(
                !written_at.contains_key(destination),
                "Destination register is written to multiple times"
            );
            written_at.insert(*destination, position);
        }

        let new_sources: Vec<_> = sources
            .iter()
            .enumerate()
            .map(|(source_position, source)| {
                // If the source will be written to before it is read, we need an intermediate register
                if written_at.get(source).copied().unwrap_or(sources.len()) < source_position {
                    let new_source = self.allocate_register();
                    self.mov_instruction(new_source, *source);
                    Some(new_source)
                } else {
                    None
                }
            })
            .collect();

        for ((source, new_source), destination) in
            sources.into_iter().zip(new_sources).zip(destinations)
        {
            if let Some(new_source) = new_source {
                self.mov_instruction(destination, new_source);
                self.deallocate_register(new_source);
            } else {
                self.mov_instruction(destination, source);
            }
        }
    }
}
