import { css } from '@mui/styled-engine';

export const dialogBody = css({
  display: 'flex',
  flexDirection: 'column',
  minWidth: '600px',
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

export const navbarButtonStyle = css({
  height: '48px',
  borderRadius: '8px',
  backgroundColor: '#CDD1D5',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  fontSize: '16px',
  lineHeight: '15px',
  color: '#000000',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
  '@media (max-width: 400px)': {
    width: '100%',
  },
});

export const navbarSelect = css({
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  border: 'none',
  minWidth: '220px',
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '@media (max-width: 400px)': {
    flexDirection: 'column',
  },
});

export const navbarSelectLabel = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  padding: '12px',
  maxWidth: '300px',
});
