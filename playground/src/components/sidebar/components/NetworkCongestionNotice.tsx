import { useContext, useEffect, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { css } from '@emotion/react';
import WarningIcon from '@mui/icons-material/WarningOutlined';

const container = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#00000063',
  padding: '1rem',
  color: '#fff',
  width: '100%',
  borderRadius: '6px',
  marginTop: '2rem',
  '@media (max-width: 900px)': {
    marginTop: '1rem',
    marginBottom: '1rem',
    fontSize: '0.8rem',
    padding: '0.5rem',
    svg: {
      width: '1.2rem',
      height: '1.2rem',
    },
  },
});

export function NetworkCongestionNotice() {
  const { node, network, isNetworkCongested, setIsNetworkCongested } = useContext(AztecContext);

  useEffect(() => {
    const checkCongestion = () => {
      if (node && network?.transactionCongestionThreshold) {
        node.getPendingTxCount().then(txCount => {
          setIsNetworkCongested(txCount > network.transactionCongestionThreshold);
        });
      }
    };

    checkCongestion();
    const interval = setInterval(checkCongestion, 60 * 1000);

    return () => clearInterval(interval);
  }, [node, network, setIsNetworkCongested]);

  useEffect(() => {
    setIsNetworkCongested(false);
  }, [network?.name, setIsNetworkCongested]);

  if (!isNetworkCongested) {
    return null;
  }

  return (
    <div css={container}>
      <WarningIcon sx={{ color: '#8d7dff', marginRight: '0.5rem' }} />
      <span>
        The {network?.name ?? 'Network'} is congested right now. Your transactions may take longer or may be dropped.
      </span>
    </div>
  );
}
