import { css } from '@mui/styled-engine';

export const dialogBody = css({
  display: 'flex',
  flexDirection: 'column',
  minWidth: '350px',
  minHeight: '500px',
});

export const form = css({
  width: '100%',
  display: 'flex',
  gap: '1rem',
  paddingTop: '0.5rem',
});

export const progressIndicator = css({
  display: 'flex',
  alignItems: 'center',
  height: '20px',
  marginBottom: '0.5rem',
});

export const select = css({
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  margin: '0.5rem 0rem',
  '@media (max-width: 400px)': {
    flexDirection: 'column',
  },
});

export const dropdownIcon = css({
  fontSize: '20px',
  marginLeft: '8px',
  transition: 'transform 0.3s ease',
});
