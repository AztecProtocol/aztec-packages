// The reset-kernel variant families and the naming shared by the variant generator and the cost
// measurer. Each family pairs a catalog group from `private_kernel_reset_variants.json` with the
// template crates the generator copies per-variant. The `inner` family contains non-siloing resets
// that are emitted mid-tx. The `finalTail` and `finalTailToPublic` families contain the terminal
// reset+tail circuits (rollup-bound and public-bound respectively).
const families = [
  {
    group: "inner",
    realFolder: "private-kernel-reset",
    simulatedFolder: "private-kernel-reset-simulated",
  },
  {
    group: "finalTail",
    realFolder: "private-kernel-reset-tail",
    simulatedFolder: "private-kernel-reset-tail-simulated",
  },
  {
    group: "finalTailToPublic",
    realFolder: "private-kernel-reset-tail-to-public",
    simulatedFolder: "private-kernel-reset-tail-to-public-simulated",
  },
];

// The shape of the template crates. A catalog entry with these dimensions is the template circuit
// itself, so no variant crate is generated for it and its artifact carries the crate's bare name.
const fullDimensions = [64, 64, 64, 64, 64, 64, 64, 64, 64];

// Converts a dimensions array to a tag string, e.g., [32, 4, 32, ...] -> "32_4_32_..."
function getResetTag(dimensions) {
  return dimensions.join("_");
}

function isFullDimensions(dimensions) {
  return dimensions.every((v, i) => v === fullDimensions[i]);
}

module.exports = { families, fullDimensions, getResetTag, isFullDimensions };
