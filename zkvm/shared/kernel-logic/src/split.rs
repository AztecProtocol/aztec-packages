use alloc::vec::Vec;
use zkvm_data_types::side_effects::HasCounter;

/// Split a sorted list of side effects into non-revertible and revertible
/// portions based on the minimum revertible counter.
///
/// Items with counter < min_revertible_counter go to non-revertible.
/// Items with counter >= min_revertible_counter go to revertible.
///
/// Ported from contract_function_simulator.ts:806-817.
pub fn split_by_revertibility<T: HasCounter + Clone>(
    items: &[T],
    min_revertible_counter: u32,
) -> (Vec<T>, Vec<T>) {
    let mut non_revertible = Vec::new();
    let mut revertible = Vec::new();

    for item in items {
        if item.counter() < min_revertible_counter {
            non_revertible.push(item.clone());
        } else {
            revertible.push(item.clone());
        }
    }

    (non_revertible, revertible)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct TestItem(u32);
    impl HasCounter for TestItem {
        fn counter(&self) -> u32 { self.0 }
    }

    #[test]
    fn split_basic() {
        let items = alloc::vec![TestItem(1), TestItem(3), TestItem(5), TestItem(7)];
        let (non_rev, rev) = split_by_revertibility(&items, 5);
        assert_eq!(non_rev.len(), 2); // counters 1, 3
        assert_eq!(rev.len(), 2);     // counters 5, 7
    }

    #[test]
    fn split_all_non_revertible() {
        let items = alloc::vec![TestItem(1), TestItem(2)];
        let (non_rev, rev) = split_by_revertibility(&items, 100);
        assert_eq!(non_rev.len(), 2);
        assert_eq!(rev.len(), 0);
    }

    #[test]
    fn split_all_revertible() {
        let items = alloc::vec![TestItem(10), TestItem(20)];
        let (non_rev, rev) = split_by_revertibility(&items, 0);
        assert_eq!(non_rev.len(), 0);
        assert_eq!(rev.len(), 2);
    }
}
