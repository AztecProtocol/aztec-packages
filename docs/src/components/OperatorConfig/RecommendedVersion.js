import React from 'react';
import { RECOMMENDED_VERSION } from './context';

/**
 * Renders the currently recommended Aztec release version, sourced from
 * network_version_config.json. Use inline in MDX where you'd otherwise
 * hardcode a version string (install-toolchain expected output, etc.).
 */
export default function RecommendedVersion() {
  return <code>{RECOMMENDED_VERSION}</code>;
}
