/**
 * The `static/aztec-nr-api/` folder a developer docs version's API links point into.
 *
 * @param {{name: string} | undefined} version the active docs version (`useActiveVersion("developer")`)
 * @param {Record<string, string>} folders `siteConfig.customFields.aztecNrApiFolders`: version → folder
 *   for every version a network reads. Versions no network reads keep their own name.
 * @returns {string}
 */
export function aztecNrApiFolder(version, folders) {
  if (!version || version.name === "current") return "next";
  return folders[version.name] ?? version.name;
}
