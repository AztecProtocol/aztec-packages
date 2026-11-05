import { useActivePlugin } from "@docusaurus/plugin-content-docs/client";
import { lineOfPlugin } from "./docsLine.mjs";

/**
 * The route base of a docs section as the current page should link it: `/<base>-<line>` on a dev
 * line's page, so its links stay on that line, else `/<base>`.
 *
 * @param {"developers" | "operate"} base
 * @returns {string}
 */
export default function useDocsBase(base) {
  const line = lineOfPlugin(useActivePlugin()?.pluginId);
  return line ? `/${base}-${line}` : `/${base}`;
}
