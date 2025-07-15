import React from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { instance } = useMsal();

  const handleLogin = async () => {
    try {
      const response = await instance.loginPopup(loginRequest);
      
      // Check if user's email domain is allowed
      const userEmail = response.account?.username || '';
      if (!userEmail.toLowerCase().endsWith('@cellcolabs.com')) {
        alert('Access denied. Only @cellcolabs.com accounts are allowed.');
        await instance.logout();
        return;
      }

      // Login successful
      onLoginSuccess({
        name: response.account?.name || '',
        email: userEmail,
        account: response.account
      });
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '20px', color: '#333' }}>
          Monday.com Workload Tracker
        </h1>
        <p style={{ marginBottom: '30px', color: '#666' }}>
          Sign in with your CellColabs Microsoft account
        </p>
        <button
          onClick={handleLogin}
          style={{
            backgroundColor: '#0078d4',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
            <path d="M10 0H21V10H10V0Z" fill="#F25022"/>
            <path d="M0 0H10V10H0V0Z" fill="#7FBA00"/>
            <path d="M10 10H21V21H10V10Z" fill="#00A4EF"/>
            <path d="M0 10H10V21H0V10Z" fill="#FFB900"/>
          </svg>
          Sign in with Microsoft
        </button>
        <p style={{ 
          marginTop: '20px', 
          fontSize: '14px', 
          color: '#888',
          maxWidth: '300px'
        }}>
          Only @cellcolabs.com accounts are allowed to access this application.
        </p>
      </div>
    </div>
  );
};

export default Login; 