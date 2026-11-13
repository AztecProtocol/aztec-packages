import { useLocation } from '@docusaurus/router';
import {
  useActivePlugin,
  useVersions,
  useActiveDocContext,
  useDocsPreferredVersion,
  useDocsVersionCandidates,
} from '@docusaurus/plugin-content-docs/client';
import { useHistorySelector } from '@docusaurus/theme-common';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import { lineOfPlugin } from '@site/src/utils/docsLine.mjs';

// Plugin IDs for our two docs instances
const DEVELOPER_PLUGIN_ID = 'developer';
// Note: Plugin ID is "network" for versioned docs compatibility, but URL path is "/operate"
const OPERATE_PLUGIN_ID = 'network';

/**
 * Determine which docs section we're currently in based on URL path
 * @returns {'developer' | 'network' | null}
 */
function useCurrentDocsSection() {
  const { pathname } = useLocation();

  if (pathname.startsWith('/developers')) {
    return DEVELOPER_PLUGIN_ID;
  }
  // Check for /operate URL path, which maps to 'network' plugin ID
  if (pathname.startsWith('/operate')) {
    return OPERATE_PLUGIN_ID;
  }
  return null;
}

/**
 * Get the main doc for a version (fallback when switching versions)
 */
function getVersionMainDoc(version) {
  return version.docs.find((doc) => doc.id === version.mainDocId);
}

/**
 * Get target doc when switching versions - tries to stay on same doc, falls back to main
 */
function getVersionTargetDoc(version, activeDocContext) {
  return (
    activeDocContext?.alternateDocVersions?.[version.name] ??
    getVersionMainDoc(version)
  );
}

/**
 * Get the displayed version for a plugin (what shows in the dropdown button)
 */
function useDisplayedVersion(pluginId, versions) {
  const candidates = useDocsVersionCandidates(pluginId);
  const candidateVersion = candidates.find((candidate) =>
    versions.some((v) => v === candidate)
  );
  return candidateVersion ?? versions[0];
}

function useSection(pluginId) {
  const versions = useVersions(pluginId);
  return {
    versions,
    context: useActiveDocContext(pluginId),
    savePreferred: useDocsPreferredVersion(pluginId).savePreferredVersionName,
    displayed: useDisplayedVersion(pluginId, versions),
  };
}

/**
 * Build dropdown items for a set of versions
 */
function buildVersionItems({ versions, context, savePreferred }, search, hash) {
  return versions.map((version) => {
    const targetDoc = getVersionTargetDoc(version, context);
    return {
      label: version.label,
      to: `${targetDoc.path}${search}${hash}`,
      isActive: () => version === context?.activeVersion,
      onClick: () => savePreferred(version.name),
    };
  });
}

/**
 * Create a section header item for grouped display
 */
function createSectionHeader(label) {
  return {
    type: 'html',
    value: `<span class="dropdown-version-section-header">${label}</span>`,
    className: 'dropdown-version-section-header-item',
  };
}

// A mobile menu with several versions gets no `to`, so tapping its label opens the list.
function sectionMenu(section, mobile, search, hash) {
  const items = buildVersionItems(section, search, hash);
  const collapsed = mobile && items.length > 1;
  return {
    items,
    label: collapsed ? 'Versions' : `${section.displayed?.label ?? 'Latest'}`,
    to: collapsed ? undefined : getVersionTargetDoc(section.displayed, section.context)?.path,
  };
}

function groupedMenu(developer, operate, search, hash) {
  return {
    items: [
      createSectionHeader('Developer Docs'),
      ...buildVersionItems(developer, search, hash),
      createSectionHeader('Operate Docs'),
      ...buildVersionItems(operate, search, hash),
    ],
    label: 'Versions',
    to: undefined,
  };
}

// The route decides whether the menu shows, and it can change while the navbar stays mounted (a
// client-side navigation inside one docs instance), so every other hook lives in VersionDropdown,
// which React mounts and unmounts as a whole.
export default function UnifiedVersionDropdown(props) {
  const { pathname } = useLocation();
  const line = lineOfPlugin(useActivePlugin()?.pluginId);

  // Hide dropdown on landing page, networks, participate section (participate is not versioned) and
  // a dev line's pages, which have one version and would otherwise get the menus of both sections
  if (line || pathname === '/' || pathname === '/networks' || pathname.startsWith('/participate')) {
    return null;
  }
  return <VersionDropdown {...props} />;
}

function VersionDropdown({ mobile, ...props }) {
  const search = useHistorySelector((history) => history.location.search);
  const hash = useHistorySelector((history) => history.location.hash);
  const currentSection = useCurrentDocsSection();
  const developer = useSection(DEVELOPER_PLUGIN_ID);
  const operate = useSection(OPERATE_PLUGIN_ID);

  // Don't render if no versions available
  if (developer.versions.length === 0 && operate.versions.length === 0) {
    return null;
  }

  const section = { [DEVELOPER_PLUGIN_ID]: developer, [OPERATE_PLUGIN_ID]: operate }[currentSection];
  const { items, label, to } = section
    ? sectionMenu(section, mobile, search, hash)
    : groupedMenu(developer, operate, search, hash);

  // If only one item (excluding headers), render as simple link
  const nonHeaderItems = items.filter(item => item.type !== 'html');
  if (nonHeaderItems.length <= 1 && nonHeaderItems.length > 0) {
    return <DefaultNavbarItem {...props} mobile={mobile} label={label} to={to} />;
  }

  return <DropdownNavbarItem {...props} mobile={mobile} label={label} to={to} items={items} />;
}
