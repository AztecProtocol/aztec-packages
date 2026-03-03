/// Expand `(label, weight)` pairs into a flat list with each label repeated `weight` times.
/// Used for weighted random command selection via `u.choose()`.
pub fn weighted_choices<'a>(entries: &[(&'a str, usize)]) -> Vec<&'a str> {
    entries
        .iter()
        .flat_map(|&(s, n)| std::iter::repeat(s).take(n))
        .collect()
}
