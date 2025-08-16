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

    async initialize() {
        if (this.isInitialized) {
            console.log('Content approval manager already initialized');
            return true;
        }

        try {
            console.log('Initializing content approval manager...');

            // Initialize individual services
            await this.fileMonitorService.initialize();
            await this.statusRouterService.initialize();

            this.isInitialized = true;
            console.log('Content approval manager initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize content approval manager:', error);
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