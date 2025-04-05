import { css } from '@mui/styled-engine';

export const container = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  backgroundColor: '#E9E9E9',
  overflow: 'auto',
  padding: '0 20px',
  textAlign: 'center',
  transition: 'all 0.3s ease',
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

export const header = css({
  display: 'flex',
  flexDirection: 'row',
  height: '5rem',
  width: '100%',
  alignItems: 'center',
  marginBottom: '1rem',
});

export const buttonContainer = css({
  marginTop: '1rem',
  width: '100%',
});

export const sectionHeader = css({
  marginTop: '1.5rem',
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 600,
  fontSize: '17px',
  color: '#000000',
});

export const nestedContainer = css({
  marginTop: '1.5rem',
  transition: 'opacity 0.3s ease',
});

export const actionButton = css({
  width: '230px',
  height: '56px',
  borderRadius: '12px',
  backgroundColor: '#CDD1D5',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px 32px',
  margin: '15px auto',
  fontFamily: "'Inter', sans-serif",
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
  '@media (max-width: 400px)': {
    width: '100%',
  },
});

export const primaryButton = css({
  width: '230px',
  height: '56px',
  borderRadius: '12px',
  backgroundColor: '#9894FF',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px 32px',
  margin: '15px auto',
  fontFamily: "'Inter', sans-serif",
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#FFFFFF',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#8985FF',
  },
  '@media (max-width: 400px)': {
    width: '100%',
  },
});
