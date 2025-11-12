import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface GoogleSignInButtonProps {
  onError?: (error: string) => void;
  disabled?: boolean;
}

// Extend the global Window interface to include google
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onError, disabled }) => {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const initializeAttempted = useRef(false);

  const handleCredentialResponse = async (response: any) => {
    try {
      await googleLogin(response.credential);
      navigate('/app');
    } catch (error: any) {
      if (onError) {
        onError(error.message);
      }
    }
  };

  const initializeGoogleSignIn = () => {
    console.log('Google Client ID:', process.env.REACT_APP_GOOGLE_CLIENT_ID);
    console.log('All env vars:', Object.keys(process.env).filter(key => key.startsWith('REACT_APP_')));
    
    if (window.google && window.google.accounts && !initializeAttempted.current) {
      const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        console.error('REACT_APP_GOOGLE_CLIENT_ID is not set!');
        if (onError) {
          onError('Google Client ID is not configured. Please check your .env file.');
        }
        return;
      }
      
      console.log('Initializing Google Sign-In with client ID:', clientId);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        });
      }
      
      initializeAttempted.current = true;
    }
  };

  useEffect(() => {
    // Check if Google Identity Services is already loaded
    if (window.google) {
      initializeGoogleSignIn();
    } else {
      // Wait for the script to load
      const checkGoogleLoaded = setInterval(() => {
        if (window.google) {
          clearInterval(checkGoogleLoaded);
          initializeGoogleSignIn();
        }
      }, 100);

      // Cleanup interval after 10 seconds
      setTimeout(() => {
        clearInterval(checkGoogleLoaded);
      }, 10000);

      return () => clearInterval(checkGoogleLoaded);
    }
  }, []);

  return (
    <div className={`w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div ref={buttonRef} className="w-full"></div>
    </div>
  );
};

export default GoogleSignInButton;
