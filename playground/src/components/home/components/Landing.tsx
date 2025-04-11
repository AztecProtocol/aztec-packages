import { css } from '@emotion/react';
import welcomeIconURL from '../../../assets/welcome_icon.svg';

const landingPage = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0',
  width: '100%',
  height: 'auto',
  minHeight: '100%',
  flex: 1,
});

const cardsContainer = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '24px',
  width: '100%',
  margin: '0 auto',
  '@media (max-width: 900px)': {
    gridTemplateColumns: 'repeat(1, 1fr)',
  },
  '@media (min-width: 901px) and (max-width: 1100px)': {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
});

const featureCard = css({
  background: '#CDD1D5',
  borderRadius: '20px',
  padding: '25px',
  height: '250px',
  display: 'flex',
  flexDirection: 'column',
});

const cardIcon = css({
  width: '50px',
  height: '50px',
  marginBottom: '35px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

const cardTitle = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '100%',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '12px',
});

const cardDescription = css({
  fontFamily: 'Inter, sans-serif',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '110%',
  letterSpacing: '0.01em',
  color: 'rgba(0, 0, 0, 0.8)',
});

const contentFrame = css({
  width: '100%',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  '@media (max-width: 1100px)': {
    width: 'auto',
    margin: '24px 0 48px 0',
    padding: '24px',
  },
});

const welcomeSection = css({
  width: '100%',
  height: '260px',
  backgroundColor: '#CDD1D5',
  borderRadius: '20px',
  position: 'relative',
  display: 'flex',
  margin: '0 auto 24px auto',
  '@media (max-width: 1000px)': {
    width: '100%',
    height: 'auto',
    flexDirection: 'column',
    padding: '20px',
  },
});

const welcomeContent = css({
  padding: '39px',
  width: '60%',
  '@media (max-width: 1000px)': {
    width: '100%',
    padding: '20px',
  },
});

const welcomeTitle = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: '130%',
  display: 'flex',
  alignItems: 'center',
  color: '#2D2D2D',
  marginBottom: '16px',
});

const welcomeText = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '135%',
  display: 'flex',
  alignItems: 'center',
  color: '#1E1E1E',
  maxWidth: '558px',
});

const mainContent = css({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  margin: '0 60px 0 24px',
  '@media (max-width: 1200px)': {
    minHeight: 'auto',
    margin: '0 24px',
  },
});

const getStartedButton = css({
  width: '205px',
  height: '56px',
  backgroundColor: '#CDD1D5',
  borderRadius: '12px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  margin: '20px auto 0',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
});

const sidebarButton = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '15px 32px',
  gap: '8px',
  width: '230px',
  height: '50px',
  margin: '8px auto',
  background: '#CDD1D5',
  borderRadius: '12px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
});

const sidebarButtonActive = css({
  background: '#9894FF',
  color: '#FFFFFF',
  '&:hover': {
    backgroundColor: '#8C7EFF',
  },
});

const flashAnimation = css({
  animation: 'flash 1s ease-in-out',
  '@keyframes flash': {
    '0%': { backgroundColor: '#E9E9E9' },
    '50%': { backgroundColor: '#9894FF' },
    '100%': { backgroundColor: '#E9E9E9' },
  },
});

// Account Abstraction icon
const AccountAbstractionIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '30px',
        height: '30px',
        left: '3.22px',
        top: '4.79px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '6.86px',
        top: '16.79px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '27.12px',
        height: '27.12px',
        left: '19.66px',
        top: '18.09px',
        background: '#9894FF',
        borderRadius: '3.2455px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '38.84px',
        top: '37.23px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
  </div>
);

// Private Voting icon
const PrivateVotingIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '40.75px',
        height: '27.12px',
        left: 'calc(50% - 40.75px/2)',
        top: '18.45px',
        background: '#9894FF',
        borderRadius: '3.2455px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '25.98px',
        height: '27.12px',
        left: 'calc(50% - 25.98px/2 - 0.57px)',
        top: '4.41px',
        background: '#2D2D2D',
        borderRadius: '3.2455px',
        transform: 'rotate(-90deg)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '22px',
        top: '8.42px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
  </div>
);

// Private Tokens icon
const PrivateTokensIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '3.8px',
        top: '3.8px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '25.76px',
        top: '3.8px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '3.8px',
        top: '25.76px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '25.76px',
        top: '25.76px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
  </div>
);

export function Landing() {
  return (
    <div css={landingPage}>
      <div css={contentFrame}>
        <div css={welcomeSection}>
          <div css={welcomeContent}>
            <div css={welcomeTitle}>Welcome to the Playground</div>
            <div css={welcomeText}>
              Playground is a web-app for interacting with Aztec. Create an aztec account, try one of our default
              contracts or upload your own and interact with it while creating client side proofs in the browser! It is
              a minimalistic remix.ethereum.org but for Aztec
            </div>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src={welcomeIconURL} alt="Welcome visualization" style={{ maxWidth: '100%', maxHeight: '200px' }} />
          </div>
        </div>

        <div css={cardsContainer}>
          <div css={featureCard}>
            <div css={cardIcon}>
              <AccountAbstractionIcon />
            </div>
            <div css={cardTitle}>Account Abstraction</div>
            <div css={cardDescription}>Short description of what account abstraction is and how it's being used</div>
          </div>

          <div css={featureCard}>
            <div css={cardIcon}>
              <PrivateVotingIcon />
            </div>
            <div css={cardTitle}>Private Voting</div>
            <div css={cardDescription}>Short description of how a user could setup private voting</div>
          </div>

          <div css={featureCard}>
            <div css={cardIcon}>
              <PrivateTokensIcon />
            </div>
            <div css={cardTitle}>Private Tokens</div>
            <div css={cardDescription}>Short description of what is possible with private tokens</div>
          </div>
        </div>

        <div css={getStartedButton}>Get Started</div>
      </div>
    </div>
  );
}
