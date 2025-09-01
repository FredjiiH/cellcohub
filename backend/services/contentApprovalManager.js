const FileMonitorService = require('./fileMonitorService');
const StatusRouterService = require('./statusRouterService');
const ExcelService = require('./excelService');
const SharePointService = require('./sharePointService');

class ContentApprovalManager {
    constructor() {
        this.fileMonitorService = new FileMonitorService();
        this.statusRouterService = new StatusRouterService();
        this.excelService = new ExcelService();
        this.sharePointService = new SharePointService();
        this.isInitialized = false;
    }

    async initialize(accessToken = null) {
        if (this.isInitialized && accessToken) {
            // If already initialized but we have a new token, just update the token
            console.log('Content approval manager already initialized, updating access token');
            this.updateAccessToken(accessToken);
            return true;
        }
        
        if (this.isInitialized) {
            console.log('Content approval manager already initialized');
            return true;
        }

        try {
            console.log('Initializing content approval manager...');

            if (accessToken) {
                console.log('Setting access token for all GraphClient services...');
                
                // Set access token for main services
                this.excelService.graphClientService.setAccessToken(accessToken);
                this.sharePointService.graphClientService.setAccessToken(accessToken);
                
                // Update the graph clients
                this.excelService.graphClient = this.excelService.graphClientService.getClient();
                this.sharePointService.graphClient = this.sharePointService.graphClientService.getClient();
                
                // Set access token for services in fileMonitorService
                this.fileMonitorService.excelService.graphClientService.setAccessToken(accessToken);
                this.fileMonitorService.sharePointService.graphClientService.setAccessToken(accessToken);
                this.fileMonitorService.excelService.graphClient = this.fileMonitorService.excelService.graphClientService.getClient();
                this.fileMonitorService.sharePointService.graphClient = this.fileMonitorService.sharePointService.graphClientService.getClient();
                
                // Set access token for services in statusRouterService
                this.statusRouterService.excelService.graphClientService.setAccessToken(accessToken);
                this.statusRouterService.sharePointService.graphClientService.setAccessToken(accessToken);
                this.statusRouterService.excelService.graphClient = this.statusRouterService.excelService.graphClientService.getClient();
                this.statusRouterService.sharePointService.graphClient = this.statusRouterService.sharePointService.graphClientService.getClient();
            }

            console.log('Initializing Excel service...');
            try {
                await this.excelService.initialize();
                console.log('✅ Excel service initialized successfully');
            } catch (error) {
                console.error('❌ Excel service initialization failed:', error.message);
                throw new Error(`Excel service failed: ${error.message}`);
            }
            
            console.log('Initializing SharePoint service...');
            try {
                await this.sharePointService.initialize();
                console.log('✅ SharePoint service initialized successfully');
            } catch (error) {
                console.error('❌ SharePoint service initialization failed:', error.message);
                throw new Error(`SharePoint service failed: ${error.message}`);
            }
            
            console.log('Initializing file monitor service...');
            try {
                await this.fileMonitorService.initialize();
                console.log('✅ File monitor service initialized successfully');
            } catch (error) {
                console.error('❌ File monitor service initialization failed:', error.message);
                throw new Error(`File monitor service failed: ${error.message}`);
            }
            
            console.log('Initializing status router service...');
            try {
                await this.statusRouterService.initialize();
                console.log('✅ Status router service initialized successfully');
            } catch (error) {
                console.error('❌ Status router service initialization failed:', error.message);
                throw new Error(`Status router service failed: ${error.message}`);
            }

            this.isInitialized = true;
            console.log('Content approval manager initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize content approval manager:', error);
            console.error('Error stack:', error.stack);
            throw error;
        }
    }

    updateAccessToken(accessToken) {
        try {
            console.log('Updating access token for all services...');
            
            // Set access token for main services
            if (this.excelService && this.excelService.graphClientService) {
                this.excelService.graphClientService.setAccessToken(accessToken);
                this.excelService.graphClient = this.excelService.graphClientService.getClient();
            }
            
            if (this.sharePointService && this.sharePointService.graphClientService) {
                this.sharePointService.graphClientService.setAccessToken(accessToken);
                this.sharePointService.graphClient = this.sharePointService.graphClientService.getClient();
            }
            
            // Set access token for services in fileMonitorService
            if (this.fileMonitorService && this.fileMonitorService.excelService && this.fileMonitorService.excelService.graphClientService) {
                this.fileMonitorService.excelService.graphClientService.setAccessToken(accessToken);
                this.fileMonitorService.excelService.graphClient = this.fileMonitorService.excelService.graphClientService.getClient();
            }
            
            if (this.fileMonitorService && this.fileMonitorService.sharePointService && this.fileMonitorService.sharePointService.graphClientService) {
                this.fileMonitorService.sharePointService.graphClientService.setAccessToken(accessToken);
                this.fileMonitorService.sharePointService.graphClient = this.fileMonitorService.sharePointService.graphClientService.getClient();
            }
            
            // Set access token for services in statusRouterService
            if (this.statusRouterService && this.statusRouterService.excelService && this.statusRouterService.excelService.graphClientService) {
                this.statusRouterService.excelService.graphClientService.setAccessToken(accessToken);
                this.statusRouterService.excelService.graphClient = this.statusRouterService.excelService.graphClientService.getClient();
            }
            
            if (this.statusRouterService && this.statusRouterService.sharePointService && this.statusRouterService.sharePointService.graphClientService) {
                this.statusRouterService.sharePointService.graphClientService.setAccessToken(accessToken);
                this.statusRouterService.sharePointService.graphClient = this.statusRouterService.sharePointService.graphClientService.getClient();
            }
            
            console.log('Access token updated for all services');
        } catch (error) {
            console.error('Error updating access token:', error);
            throw error;
        }
    }

    async start(accessToken = null) {
        if (!this.isInitialized) {
            await this.initialize(accessToken);
        }

        console.log('Starting content approval services...');
        
        // Start both monitoring services
        await this.fileMonitorService.start();
        await this.statusRouterService.start();

        console.log('Content approval services started successfully');
    }

    async stop() {
        console.log('Stopping content approval services...');
        
        await this.fileMonitorService.stop();
        await this.statusRouterService.stop();

        console.log('Content approval services stopped');
    }

    async restart() {
        await this.stop();
        await this.start();
    }

    async getServiceStatus() {
        return {
            initialized: this.isInitialized,
            fileMonitor: {
                running: this.fileMonitorService.isRunning,
                intervalMinutes: this.fileMonitorService.intervalMinutes
            },
            statusRouter: {
                running: this.statusRouterService.isRunning,
                intervalMinutes: this.statusRouterService.intervalMinutes
            }
        };
    }

    // Manual triggers for testing
    async triggerFileCheck() {
        if (!this.isInitialized) {
            throw new Error('Manager not initialized');
        }
        return await this.fileMonitorService.manualFileCheck();
    }

    async triggerStatusCheck() {
        if (!this.isInitialized) {
            throw new Error('Manager not initialized');
        }
        return await this.statusRouterService.manualStatusCheck();
    }

    // Data access methods
    async getProcessingLogs(limit = 100) {
        return await this.fileMonitorService.getProcessingLogs(limit);
    }

    async getErrorLogs(limit = 50) {
        return await this.fileMonitorService.getErrorLogs(limit);
    }

    async getProcessingStats() {
        return await this.statusRouterService.getProcessingStats();
    }

    async getStep1Data() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return await this.excelService.getAllTableRows('Step1_Review');
    }

    async getMRLData() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return await this.excelService.getAllTableRows('MRL_Review');
    }

    async getReadyToReviewFiles() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return await this.sharePointService.getFilesInReadyToReview();
    }

    // Health check
    async healthCheck() {
        try {
            const status = await this.getServiceStatus();
            const stats = await this.getProcessingStats();
            const recentErrors = await this.getErrorLogs(10);

            return {
                status: 'healthy',
                services: status,
                recentStats: stats,
                recentErrors: recentErrors.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = ContentApprovalManager;