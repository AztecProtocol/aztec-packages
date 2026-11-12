import { lineOfPlugin } from "./docsLine.mjs";

/**
 * The `static/aztec-nr-api/` folder a developer docs version's API links point into.
 *
 * @param {{name: string} | undefined} version the active docs version
 * @param {Record<string, string>} folders `siteConfig.customFields.aztecNrApiFolders`: version → folder
 *   for every version a network reads. Versions no network reads keep their own name.
 * @param {string} [pluginId] the active docs plugin; a dev line's reads `lineFolders`
 * @param {Record<string, string>} [lineFolders] `siteConfig.customFields.lineApiFolders`: line → folder
 * @returns {string}
 */
export function aztecNrApiFolder(version, folders, pluginId, lineFolders = {}) {
  const line = lineOfPlugin(pluginId);
  if (line) return lineFolders[line];
  if (!version || version.name === "current") return "next";
  return folders[version.name] ?? version.name;
}
