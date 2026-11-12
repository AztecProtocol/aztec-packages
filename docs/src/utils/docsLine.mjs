/**
 * The dev line a docs plugin serves, from its id (`developer-<line>` or `network-<line>`, as
 * `lineInstances` in src/network_docs.js names them).
 *
 * @param {string | undefined} pluginId
 * @returns {string | undefined} the line, like `v6`; undefined for every other plugin
 */
export const lineOfPlugin = (pluginId) => /^(?:developer|network)-(v\d+)$/.exec(pluginId ?? "")?.[1];

/**
 * `path` moved onto `line`'s instances when it points into the dev docs (`/developers`, `/operate`);
 * any other path unchanged.
 *
 * @param {string} path a site path, like `/developers/docs/aztec-js`
 * @param {string} line
 * @returns {string}
 */
export const lineDocsPath = (path, line) => path.replace(/^\/(developers|operate)(?=[/?#]|$)/, `/$1-${line}`);

/**
 * A navbar item's props as a dev line's page renders them: docs items of the dev docs read the
 * line's plugin, links into the dev docs move onto the line, and so do a dropdown's children, before
 * the dropdown matches them against the current page.
 *
 * @param {object} props the item's config props
 * @param {string} line
 * @returns {object}
 */
export function lineNavbarProps(props, line) {
  let out = props;
  if (props.docsPluginId === "developer" || props.docsPluginId === "network")
    out = { ...out, docsPluginId: `${props.docsPluginId}-${line}` };
  if (typeof props.to === "string") out = { ...out, to: lineDocsPath(props.to, line) };
  if (Array.isArray(props.items)) out = { ...out, items: props.items.map((item) => lineNavbarProps(item, line)) };
  return out;
}
