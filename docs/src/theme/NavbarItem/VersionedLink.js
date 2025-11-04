import React from 'react';
import {useActiveDocContext} from '@docusaurus/plugin-content-docs/client';
import Link from '@docusaurus/Link';

export default function VersionedLink() {
  const {activeVersion} = useActiveDocContext('default');

  // Get the current version - this will be the actual version string like "v2.0.4"
  const versionName = activeVersion?.name || activeVersion?.label || 'current';

  // Debug log to see what version we're getting
  console.log('Current version:', versionName);

  // Determine which link to show based on version
  let label = '';
  let href = '';

  if (versionName === 'v2.0.4' || versionName.includes('2.0.4') || versionName.toLowerCase().includes('testnet')) {
    // Testnet version (v2.0.4)
    label = 'Try Testnet';
    href = '/try_testnet';
  } else if (versionName === 'v3.0.0-devnet.4' || versionName.includes('devnet')) {
    // Devnet version (v3.0.0-devnet.4)
    label = 'Try Devnet';
    href = '/devnet/try_devnet';
  } else if (versionName.includes('nightly')) {
    // Nightly builds - show devnet since they're cutting edge
    label = 'Try Devnet';
    href = '/devnet/try_devnet';
  } else if (versionName === 'current' || versionName === 'dev') {
    // Development version - show devnet as it's the latest
    label = 'Try Testnet';
    href = '/try_testnet';
  } else {
    // Default for unknown versions
    label = 'Try Testnet';
    href = '/try_testnet';
  }

  return (
    <Link
      className="navbar__item navbar__link"
      to={href}
      style={{
        fontWeight: 500,
      }}
    >
      {label}
    </Link>
  );
}
