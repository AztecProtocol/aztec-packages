import { useContext, useEffect, useState } from "react";
import { AztecContext } from "../../../aztecEnv";
import { css } from "@emotion/react";
import WarningIcon from '@mui/icons-material/WarningOutlined';


const container = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#FFF3C0',
  padding: '1rem',
  width: '100%',
  borderRadius: '6px',
  marginTop: '2rem',
  '@media (max-width: 900px)': {
    marginTop: '1rem',
  },
});

export function NetworkCongestionNotice() {
  const { node, network } = useContext(AztecContext);

  const [isNetworkCongested, setIsNetworkCongested] = useState(false);

  useEffect(() => {
    const checkCongestion = () => {
      if (node && network?.transactionCongestionThreshold) {
        node.getPendingTxCount().then((txCount) => {
          setIsNetworkCongested(txCount > network.transactionCongestionThreshold);
        });
      }
    };

    checkCongestion();
    const interval = setInterval(checkCongestion, 60000);

    return () => clearInterval(interval);
  }, [node, network]);

  useEffect(() => {
    setIsNetworkCongested(false);
  }, [network?.name]);


  if (!isNetworkCongested) {
    return null;
  }

  return (
    <div css={container}>
      <WarningIcon sx={{ color: '#f39c12', marginRight: '0.5rem' }} />
      <span>
        {network?.name ?? 'Network'} is congested right now.
        Your transactions may take longer than normal to be included in a block.
      </span>
    </div>
  );
}
