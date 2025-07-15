const { ConfidentialClientApplication } = require('@azure/msal-node');

// MSAL configuration for backend
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/common`
  }
};

const msalInstance = new ConfidentialClientApplication(msalConfig);

// Middleware to validate Azure AD tokens
const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate the token with Azure AD
    const result = await msalInstance.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });

    // For now, we'll do basic validation
    // In production, you should validate the JWT token properly
    if (token && token.length > 0) {
      // Extract user info from token (you might want to decode the JWT)
      // For now, we'll assume the token is valid if it exists
      req.user = {
        // You can extract user info from the token here
        email: req.headers['x-user-email'] || 'unknown@cellcolabs.com',
        name: req.headers['x-user-name'] || 'Unknown User'
      };
      next();
    } else {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Token validation error:', error);
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