import React from 'react';
import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import { useActivePlugin } from '@docusaurus/plugin-content-docs/client';
import UnifiedVersionDropdown from './UnifiedVersionDropdown';
import { lineDocsPath, lineOfPlugin } from '@site/src/utils/docsLine.mjs';

// On a dev line's page the shared navbar (desktop and mobile, dropdown children included) leads to
// the line's own instances, not the dev docs. Elsewhere every item renders exactly as configured.
function onLine(Item, rewrite) {
  return function LineNavbarItem(props) {
    const line = lineOfPlugin(useActivePlugin()?.pluginId);
    return <Item {...(line ? rewrite(props, line) : props)} />;
  };
}

const linePlugin = (props, line) =>
  props.docsPluginId === 'developer' || props.docsPluginId === 'network'
    ? { ...props, docsPluginId: `${props.docsPluginId}-${line}` }
    : props;
const lineLink = (props, line) => (typeof props.to === 'string' ? { ...props, to: lineDocsPath(props.to, line) } : props);

export default {
  ...ComponentTypes,
  default: onLine(ComponentTypes.default, lineLink),
  doc: onLine(ComponentTypes.doc, linePlugin),
  docSidebar: onLine(ComponentTypes.docSidebar, linePlugin),
  'custom-unifiedVersionDropdown': UnifiedVersionDropdown,
};
