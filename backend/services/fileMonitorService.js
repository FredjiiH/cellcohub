const SharePointService = require('./sharePointService');
const ExcelService = require('./excelService');
const { MongoClient } = require('mongodb');

class FileMonitorService {
    constructor() {
        this.sharePointService = new SharePointService();
        this.excelService = new ExcelService();
        this.db = null;
        this.isRunning = false;
        this.monitorInterval = null;
        this.intervalMinutes = 2; // Check every 2 minutes
    }

    async initialize() {
        try {
            // Initialize services
            await this.sharePointService.initialize();
            await this.excelService.initialize();

            // Connect to MongoDB
            const client = new MongoClient(process.env.MONGODB_URI);
            await client.connect();
            this.db = client.db('monday-workload');

            console.log('File monitor service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize file monitor service:', error);
            throw error;
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('File monitor service is already running');
            return;
        }

        console.log(`Starting file monitor service (checking every ${this.intervalMinutes} minutes)`);
        this.isRunning = true;

        // Run initial check
        await this.checkForNewFiles();

        // Set up interval
        this.monitorInterval = setInterval(async () => {
            try {
                await this.checkForNewFiles();
            } catch (error) {
                console.error('Error in file monitor interval:', error);
                await this.logError('FILE_MONITOR_INTERVAL', error.message);
            }
        }, this.intervalMinutes * 60 * 1000);

        console.log('File monitor service started');
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping file monitor service');
        this.isRunning = false;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        console.log('File monitor service stopped');
    }

    async checkForNewFiles() {
        try {
            console.log('Checking for new files in Ready to Review folder...');
            
            const files = await this.sharePointService.getFilesInReadyToReview();
            console.log(`Found ${files.length} files in Ready to Review folder`);

            for (const file of files) {
                try {
                    await this.processFile(file);
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    await this.logError('FILE_PROCESSING', error.message, file.id);
                }
            }

        } catch (error) {
            console.error('Error checking for new files:', error);
            await this.logError('FILE_CHECK', error.message);
            throw error;
        }
    }

    async processFile(file) {
        try {
            // Check if file is already processed
            const existingLog = await this.getProcessingLog(file.id);
            if (existingLog && existingLog.action === 'ingested' && existingLog.status === 'success') {
                // File already processed successfully
                return;
            }

            console.log(`Processing new file: ${file.name}`);

            // Get detailed file metadata
            const fileMetadata = await this.sharePointService.getFileMetadata(file.id);
            
            // Parse filename
            const parsedName = this.sharePointService.parseFileName(file.name);
            
            // Create Step1 row data
            const step1RowData = this.sharePointService.createStep1RowData(fileMetadata, parsedName);
            
            // Check if already exists in Excel (by FileID)
            const existingRow = await this.excelService.findRowByFileId('Step1_Review', file.id);
            if (existingRow) {
                console.log(`File ${file.name} already exists in Step1_Review table`);
                await this.logProcessingAction(file.id, file.name, 'ingested', 'success', 'File already existed in Excel');
                return;
            }

            // Add to Step1_Review table
            await this.excelService.addRowToTable('Step1_Review', step1RowData);
            
            // Log successful processing
            await this.logProcessingAction(file.id, file.name, 'ingested', 'success', 'Added to Step1_Review table');
            
            console.log(`Successfully processed file: ${file.name}`);

        } catch (error) {
            console.error(`Error in processFile for ${file.name}:`, error);
            await this.logProcessingAction(file.id, file.name, 'ingested', 'error', error.message);
            throw error;
        }
    }

    async logProcessingAction(fileId, fileName, action, status, details = '') {
        try {
            const logEntry = {
                fileId,
                fileName,
                action,
                status,
                details,
                timestamp: new Date(),
                retryCount: 0
            };

            await this.db.collection('processing_logs').insertOne(logEntry);
        } catch (error) {
            console.error('Error logging processing action:', error);
        }
    }

    async logError(action, errorMessage, fileId = null) {
        try {
            const errorEntry = {
                fileId,
                action,
                error: errorMessage,
                timestamp: new Date(),
                level: 'error'
            };

            await this.db.collection('error_logs').insertOne(errorEntry);
        } catch (error) {
            console.error('Error logging error:', error);
        }
    }

    async getProcessingLog(fileId) {
        try {
            return await this.db.collection('processing_logs')
                .findOne({ fileId }, { sort: { timestamp: -1 } });
        } catch (error) {
            console.error('Error getting processing log:', error);
            return null;
        }
    }

    async getProcessingLogs(limit = 100) {
        try {
            return await this.db.collection('processing_logs')
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting processing logs:', error);
            return [];
        }
    }

    async getErrorLogs(limit = 50) {
        try {
            return await this.db.collection('error_logs')
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting error logs:', error);
            return [];
        }
    }

    // Manual trigger for testing
    async manualFileCheck() {
        console.log('Manual file check triggered');
        await this.checkForNewFiles();
    }
}

module.exports = FileMonitorService;