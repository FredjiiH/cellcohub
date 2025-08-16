const { Client } = require('@microsoft/microsoft-graph-client');
const { AuthenticationProvider } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

class DelegatedAuthProvider {
    constructor(accessToken) {
        this.accessToken = accessToken;
    }

    async getAccessToken() {
        return this.accessToken;
    }
}

class GraphClientService {
    constructor(accessToken = null) {
        this.tenantId = process.env.AZURE_TENANT_ID;
        this.clientId = process.env.AZURE_CLIENT_ID;
        this.clientSecret = process.env.AZURE_CLIENT_SECRET;
        
        if (!this.tenantId || !this.clientId) {
            throw new Error('Missing Azure AD configuration. Please set AZURE_TENANT_ID and AZURE_CLIENT_ID environment variables.');
        }

        if (accessToken) {
            // Use delegated permissions with user's access token
            this.authProvider = new DelegatedAuthProvider(accessToken);
            this.graphClient = Client.initWithMiddleware({
                authProvider: {
                    getAccessToken: async () => {
                        return await this.authProvider.getAccessToken();
                    }
                }
            });
        } else {
            // Fallback: no Graph client until token is provided
            this.graphClient = null;
        }
    }

    setAccessToken(accessToken) {
        this.authProvider = new DelegatedAuthProvider(accessToken);
        this.graphClient = Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    return await this.authProvider.getAccessToken();
                }
            }
        });
    }

    getClient() {
        if (!this.graphClient) {
            throw new Error('Graph client not initialized. Access token required.');
        }
        return this.graphClient;
    }

    async testConnection() {
        try {
            if (!this.graphClient) {
                return false;
            }
            await this.graphClient.api('/me').get();
            return true;
        } catch (error) {
            console.error('Graph client connection test failed:', error);
            return false;
        }
    }
}

module.exports = GraphClientService;