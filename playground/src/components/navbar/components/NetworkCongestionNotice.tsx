import { useContext, useEffect } from 'react';
import { AztecContext } from '../../../aztecContext';
import { css } from '@emotion/react';
import WarningIcon from '@mui/icons-material/WarningOutlined';
import { colors, commonStyles } from '../../../global.styles';

const container = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: commonStyles.glassDarker,
  border: commonStyles.borderMedium,
  padding: '1rem',
  color: colors.text.primary,
  width: '100%',
  borderRadius: commonStyles.borderRadius,
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
      <WarningIcon sx={{ color: colors.primary.main, marginRight: '0.5rem' }} />
      <span>
        The {network?.name ?? 'Network'} is congested right now. Your transactions may take longer or may be dropped.
      </span>
    </div>
  );
}
