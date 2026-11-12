/**
 * Release line names.
 *
 * Three things have names and they must not be mixed up:
 *   - networks (Alpha, Testnet): where software is deployed
 *   - release lines (Tierra = v6.x): what a network runs, keyed by major version
 *   - versions (6.0.0): what code pins; CLI, env and Docker values stay numeric
 *
 * release_names.json maps a major version to its release line name. Everything
 * that shows a name (version dropdown, version badge, #release_name macro)
 * derives it from here, so naming a new line is a one-line change.
 */
const releaseNames = require("../release_names.json");

function majorOf(version) {
  const match = String(version).match(/^v?(\d+)/);
  return match ? match[1] : null;
}

function withPrefix(version) {
  const value = String(version);
  return value.startsWith("v") ? value : `v${value}`;
}

/** The release line name for a version ("Tierra" for 6.x), or null if unnamed. */
function releaseNameFor(version) {
  const major = majorOf(version);
  return (major && releaseNames[major]) || null;
}

/**
 * Human label for a docs version: "Tierra (v6.0.0)", or "v5.2.0" for an unnamed
 * line. An optional network suffix distinguishes entries when Alpha and Testnet
 * run different versions of the same line: "Tierra (v6.1.0) · Testnet".
 */
function versionLabel(version, network) {
  const name = releaseNameFor(version);
  const prefixed = withPrefix(version);
  const base = name ? `${name} (${prefixed})` : prefixed;
  return network ? `${base} · ${network}` : base;
}

module.exports = { releaseNames, releaseNameFor, versionLabel };
