/// A HashMap meant to be used in comptime code.
/// It looks less efficient than UHashMap because it stores entries in a slice, and it works
/// by doing linear lookups, but like this less time is spent in the interpreter, which
/// is the main bottleneck when running comptime code.
pub struct CHashMap<K, V> {
    entries: [(K, V)],
}

impl<K, V> CHashMap<K, V> {
    /// Create a new [CHashMap].
    pub comptime fn new() -> Self {
        Self { entries: [] }
    }

    /// Returns [some][Option::some] value associated with the given key, or [none][Option::none]
    /// if no such key exists in this map.
    pub comptime fn get(self, key: K) -> Option<V>
    where
        K: Eq,
    {
        let mut result = Option::none();
        for entry in self.entries {
            if entry.0 == key {
                result = Option::some(entry.1);
                break;
            }
        }
        result
    }

    /// Inserts a key-value pair. If a key already exists in this map, its associated
    /// value is updated.
    pub comptime fn insert(&mut self, key: K, value: V)
    where
        K: Eq,
    {
        let mut found = false;
        for index in 0..self.entries.len() {
            let entry = self.entries[index];
            if entry.0 == key {
                self.entries[index] = (key, value);
                found = true;
                break;
            }
        }
        if !found {
            self.entries = self.entries.push_back((key, value));
        }
    }
}

impl<K, V> Default for CHashMap<K, V> {
    comptime fn default() -> Self {
        Self::new()
    }
}
