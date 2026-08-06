import { useEffect } from 'react';
import { useOperatorConfig } from './context';

// Pins the stakeMode track axis to the role a docs section is dedicated to
// (solo-sequencer/ pages force "self", provider/ pages force "provider"), so
// the OperatorConfig panel and any IfChoice blocks match the section the
// reader navigated into regardless of what localStorage held before.
export default function ForceStakeMode({ mode }) {
  const { track, setTrack, hydrated } = useOperatorConfig();
  useEffect(() => {
    if (!hydrated) return;
    if ((mode === 'self' || mode === 'provider') && track.stakeMode !== mode) {
      setTrack('stakeMode', mode);
    }
  }, [hydrated, mode, track.stakeMode, setTrack]);
  return null;
}
