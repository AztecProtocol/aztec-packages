import React from 'react';
import { useLocation } from '@docusaurus/router';
import {
  useVersions,
  useActiveDocContext,
  useDocsPreferredVersion,
  useDocsVersionCandidates,
} from '@docusaurus/plugin-content-docs/client';
import { useHistorySelector } from '@docusaurus/theme-common';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';

// Plugin IDs for our two docs instances
const DEVELOPER_PLUGIN_ID = 'developer';
const NETWORK_PLUGIN_ID = 'network';

/**
 * Determine which docs section we're currently in based on URL path
 * @returns {'developer' | 'network' | null}
 */
function useCurrentDocsSection() {
  const { pathname } = useLocation();

  if (pathname.startsWith('/developers')) {
    return DEVELOPER_PLUGIN_ID;
  }
  if (pathname.startsWith('/network')) {
    return NETWORK_PLUGIN_ID;
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

/**
 * Build dropdown items for a set of versions
 */
function buildVersionItems(versions, activeDocContext, savePreferred, search, hash) {
  return versions.map((version) => {
    const targetDoc = getVersionTargetDoc(version, activeDocContext);
    return {
      label: version.label,
      to: `${targetDoc.path}${search}${hash}`,
      isActive: () => version === activeDocContext?.activeVersion,
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

export default function UnifiedVersionDropdown({ mobile, ...props }) {
  const { pathname } = useLocation();

  // Hide dropdown on landing page
  if (pathname === '/' || pathname === '/networks') {
    return null;
  }

  const search = useHistorySelector((history) => history.location.search);
  const hash = useHistorySelector((history) => history.location.hash);

  const currentSection = useCurrentDocsSection();

  // Get versions for both plugins
  const developerVersions = useVersions(DEVELOPER_PLUGIN_ID);
  const networkVersions = useVersions(NETWORK_PLUGIN_ID);

  // Get active contexts for both plugins
  const developerContext = useActiveDocContext(DEVELOPER_PLUGIN_ID);
  const networkContext = useActiveDocContext(NETWORK_PLUGIN_ID);

  // Get preferred version handlers
  const { savePreferredVersionName: saveDeveloperPreferred } =
    useDocsPreferredVersion(DEVELOPER_PLUGIN_ID);
  const { savePreferredVersionName: saveNetworkPreferred } =
    useDocsPreferredVersion(NETWORK_PLUGIN_ID);

  // Get displayed versions for label
  const displayedDeveloperVersion = useDisplayedVersion(DEVELOPER_PLUGIN_ID, developerVersions);
  const displayedNetworkVersion = useDisplayedVersion(NETWORK_PLUGIN_ID, networkVersions);

  // Build items and label based on current section
  let items = [];
  let dropdownLabel = 'Versions';
  let dropdownTo = undefined;

  if (currentSection === DEVELOPER_PLUGIN_ID) {
    // On developer pages: show only developer versions
    items = buildVersionItems(
      developerVersions,
      developerContext,
      saveDeveloperPreferred,
      search,
      hash
    );
    dropdownLabel = mobile && items.length > 1
      ? 'Versions'
      : `${displayedDeveloperVersion?.label ?? 'Latest'}`;
    if (!mobile || items.length <= 1) {
      const targetDoc = getVersionTargetDoc(displayedDeveloperVersion, developerContext);
      dropdownTo = targetDoc?.path;
    }
  } else if (currentSection === NETWORK_PLUGIN_ID) {
    // On network pages: show only network versions
    items = buildVersionItems(
      networkVersions,
      networkContext,
      saveNetworkPreferred,
      search,
      hash
    );
    dropdownLabel = mobile && items.length > 1
      ? 'Versions'
      : `${displayedNetworkVersion?.label ?? 'Latest'}`;
    if (!mobile || items.length <= 1) {
      const targetDoc = getVersionTargetDoc(displayedNetworkVersion, networkContext);
      dropdownTo = targetDoc?.path;
    }
  } else {
    // On other pages (home, etc.): show all versions grouped
    const developerItems = buildVersionItems(
      developerVersions,
      developerContext,
      saveDeveloperPreferred,
      search,
      hash
    );
    const networkItems = buildVersionItems(
      networkVersions,
      networkContext,
      saveNetworkPreferred,
      search,
      hash
    );

    items = [
      createSectionHeader('Developer Docs'),
      ...developerItems,
      createSectionHeader('Network Docs'),
      ...networkItems,
    ];
    dropdownLabel = 'Versions';
  }

  // Don't render if no versions available
  if (developerVersions.length === 0 && networkVersions.length === 0) {
    return null;
  }

  // If only one item (excluding headers), render as simple link
  const nonHeaderItems = items.filter(item => item.type !== 'html');
  if (nonHeaderItems.length <= 1 && nonHeaderItems.length > 0) {
    return (
      <DefaultNavbarItem
        {...props}
        mobile={mobile}
        label={dropdownLabel}
        to={dropdownTo}
      />
    );
  }

  return (
    <DropdownNavbarItem
      {...props}
      mobile={mobile}
      label={dropdownLabel}
      to={dropdownTo}
      items={items}
    />
  );
}
