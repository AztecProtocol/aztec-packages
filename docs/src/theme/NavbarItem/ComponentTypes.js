import React from 'react';
import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import { useActivePlugin } from '@docusaurus/plugin-content-docs/client';
import UnifiedVersionDropdown from './UnifiedVersionDropdown';
import { lineNavbarProps, lineOfPlugin } from '@site/src/utils/docsLine.mjs';

// On a dev line's page the shared navbar (desktop and mobile) leads to the line's own instances, not
// the dev docs. Elsewhere every item renders exactly as configured.
function onLine(Item) {
  return function LineNavbarItem(props) {
    const line = lineOfPlugin(useActivePlugin()?.pluginId);
    return <Item {...(line ? lineNavbarProps(props, line) : props)} />;
  };
}

export default {
  ...ComponentTypes,
  default: onLine(ComponentTypes.default),
  doc: onLine(ComponentTypes.doc),
  docSidebar: onLine(ComponentTypes.docSidebar),
  dropdown: onLine(ComponentTypes.dropdown),
  'custom-unifiedVersionDropdown': UnifiedVersionDropdown,
};
