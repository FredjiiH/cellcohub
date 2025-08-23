const { ConfidentialClientApplication } = require('@azure/msal-node');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Check for required environment variables
if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
  console.error('❌ Missing Azure AD environment variables!');
  console.error('Please set the following environment variables:');
  console.error('- AZURE_CLIENT_ID');
  console.error('- AZURE_CLIENT_SECRET');
  console.error('- AZURE_TENANT_ID (optional, defaults to "common")');
  console.error('');
  console.error('For local development, create a .env file in the backend folder with:');
  console.error('AZURE_CLIENT_ID=your_client_id');
  console.error('AZURE_CLIENT_SECRET=your_client_secret');
  console.error('AZURE_TENANT_ID=your_tenant_id');
  console.error('');
  process.exit(1);
}

// MSAL configuration for backend
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`
  }
};

const msalInstance = new ConfidentialClientApplication(msalConfig);

// JWKS client for token validation
const jwksClientInstance = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}/discovery/v2.0/keys`,
  timeout: 30000
});

// Middleware to validate Azure AD tokens
const validateToken = async (req, res, next) => {
  try {
    console.log(`🔐 Auth check for ${req.method} ${req.path}`);
    console.log('Headers:', {
      authorization: req.headers.authorization ? `Bearer ${req.headers.authorization.substring(7, 20)}...` : 'MISSING',
      'x-user-email': req.headers['x-user-email'],
      'x-user-name': req.headers['x-user-name']
    });
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Invalid authorization header format');
      return res.status(401).json({ error: 'No valid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // For now, we'll do basic validation since we're using the user info from headers
    // In production, you should validate the JWT token properly with Azure AD
    if (token && token.length > 0) {
      // Extract user info from headers (sent by frontend)
      req.user = {
        email: req.headers['x-user-email'] || 'unknown@cellcolabs.com',
        name: req.headers['x-user-name'] || 'Unknown User'
      };
      console.log('✅ Auth passed, proceeding to endpoint');
      next();
    } else {
      console.log('❌ Empty or invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return res.status(401).json({ error: 'Token validation failed' });
  }
};

// Check if user has @cellcolabs.com domain
const checkDomain = (req, res, next) => {
  const userEmail = req.user?.email || '';
  
  if (!userEmail.toLowerCase().endsWith('@cellcolabs.com')) {
    return res.status(403).json({ 
      error: 'Access denied. Only @cellcolabs.com accounts are allowed.' 
    });
  }
  
  next();
};

module.exports = {
  validateToken,
  checkDomain
}; 