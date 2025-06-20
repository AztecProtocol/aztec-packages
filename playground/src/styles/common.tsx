import { css, keyframes } from '@mui/styled-engine';

export const dialogBody = css({
  display: 'flex',
  flexDirection: 'column',
  minWidth: '600px',
  minHeight: '500px',

  '@media (max-width: 900px)': {
    minWidth: '320px',
  },
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
  backgroundColor: '#ffffff38',
  width: '300px',
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  fontSize: '16px',
  lineHeight: '15px',
  color: '#000000',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  transition: 'background-color 0.3s ease',

  '&:hover': {
    backgroundColor: '#f8f8f8',
  },

  '@media (max-width: 900px)': {
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

const loadingAnimationLayer1 = keyframes`
  0% { box-shadow: 0px 0px 0 0px  }
  90% , 100% { box-shadow: 20px 20px 0 -4px  }
`;

const loadingAnimationLayerTr = keyframes`
  0% { transform:  translate(0, 0) scale(1) }
  100% {  transform: translate(-25px, -25px) scale(1) }
`;

export const loader = css({
  margin: '1rem',
  position: 'relative',
  width: '48px',
  height: '48px',
  background: 'var(--mui-palette-primary-main)',
  transform: 'rotateX(65deg) rotate(45deg)',
  color: 'var(--mui-palette-primary-dark)',
  animation: `${loadingAnimationLayer1} 0.75s linear infinite alternate`,
  ':after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'var(--mui-palette-primary-light)',
    animation: `${loadingAnimationLayerTr} 0.75s linear infinite alternate`,
  },
});
