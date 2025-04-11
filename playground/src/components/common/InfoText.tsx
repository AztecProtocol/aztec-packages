import { css } from '@emotion/react';
import InfoIcon from '@mui/icons-material/Info';
import { Typography } from '@mui/material';

const container = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  width: '100%',
  textWrap: 'wrap',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
  margin: '0.5rem 0',
});

const text = css({
  color: 'rgba(0, 0, 0, 0.6)',
  marginTop: '0.15rem',
  marginLeft: '0.5rem',
});

export function InfoText({ children }) {
  return (
    <div css={container}>
      <InfoIcon />
      <Typography css={text} variant="caption">
        {children}
      </Typography>
    </div>
  );
}
