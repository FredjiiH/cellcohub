const ExcelService = require('./excelService');
const SharePointService = require('./sharePointService');
const { MongoClient } = require('mongodb');

class StatusRouterService {
    constructor() {
        this.excelService = new ExcelService();
        this.sharePointService = new SharePointService();
        this.db = null;
        this.isRunning = false;
        this.routerInterval = null;
        this.intervalMinutes = 5; // Check every 5 minutes, same as original flow
    }

    async initialize() {
        try {
            // Initialize services
            await this.excelService.initialize();
            await this.sharePointService.initialize();

            // Connect to MongoDB
            const client = new MongoClient(process.env.MONGODB_URI);
            await client.connect();
            this.db = client.db('monday-workload');

            console.log('Status router service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize status router service:', error);
            throw error;
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('Status router service is already running');
            return;
        }

        console.log(`Starting status router service (checking every ${this.intervalMinutes} minutes)`);
        this.isRunning = true;

        // Run initial check
        await this.processStatusChanges();

        // Set up interval
        this.routerInterval = setInterval(async () => {
            try {
                await this.processStatusChanges();
            } catch (error) {
                console.error('Error in status router interval:', error);
                await this.logError('STATUS_ROUTER_INTERVAL', error.message);
            }
        }, this.intervalMinutes * 60 * 1000);

        console.log('Status router service started');
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping status router service');
        this.isRunning = false;

        if (this.routerInterval) {
            clearInterval(this.routerInterval);
            this.routerInterval = null;
        }

        console.log('Status router service stopped');
    }

    async processStatusChanges() {
        try {
            console.log('Processing status changes in Step1_Review table...');
            
            // Get all rows from Step1_Review table
            const step1Rows = await this.excelService.getAllTableRows('Step1_Review');
            console.log(`Found ${step1Rows.length} rows in Step1_Review table`);

            let processedCount = 0;

            for (const [index, row] of step1Rows.entries()) {
                try {
                    const fileId = row.values[0][0]; // FileID in first column
                    const status = row.values[0][this.excelService.getColumnIndex('Step1_Review', 'Status')];
                    
                    // Skip if no FileID or status
                    if (!fileId || !status) {
                        continue;
                    }

                    const processed = await this.processRowByStatus(fileId, status, row, index);
                    if (processed) {
                        processedCount++;
                    }

                } catch (error) {
                    console.error(`Error processing row ${index}:`, error);
                    await this.logError('ROW_PROCESSING', error.message, row.values[0][0]);
                }
            }

            console.log(`Processed ${processedCount} status changes`);

        } catch (error) {
            console.error('Error processing status changes:', error);
            await this.logError('STATUS_PROCESSING', error.message);
            throw error;
        }
    }

    async processRowByStatus(fileId, status, row, rowIndex) {
        try {
            switch (status) {
                case 'Needs Med/Reg/Leg Review':
                case 'Needs MRL Review': // Alternative spelling
                    return await this.handleMRLRouting(fileId, row, rowIndex);
                
                case 'Fast track':
                    return await this.handleFastTrack(fileId, row, rowIndex);
                
                default:
                    // No action needed for other statuses
                    return false;
            }
        } catch (error) {
            console.error(`Error processing status ${status} for FileID ${fileId}:`, error);
            
            // Update error column in Excel
            const errorColumnIndex = this.excelService.getColumnIndex('Step1_Review', 'Error');
            if (errorColumnIndex !== undefined) {
                await this.excelService.updateRowByIndex('Step1_Review', rowIndex, {
                    [errorColumnIndex]: error.message
                });
            }
            
            throw error;
        }
    }

    async handleMRLRouting(fileId, step1Row, rowIndex) {
        try {
            console.log(`Handling MRL routing for FileID: ${fileId}`);
            
            // Check if already processed (has Routed On date)
            const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
            const routedOn = step1Row.values[0][routedOnIndex];
            
            if (routedOn && routedOn.trim() !== '') {
                console.log(`FileID ${fileId} already routed to MRL (Routed On: ${routedOn})`);
                return false;
            }

            // Step 1: De-dup check and add to MRL table if needed
            const mrlResult = await this.excelService.addToMRLIfNotExists(step1Row);
            
            // Step 2: Update Step1 row with routing information
            const now = new Date().toISOString();
            const lastActionIndex = this.excelService.getColumnIndex('Step1_Review', 'Last Action');
            
            const updates = {
                [routedOnIndex]: now,
                [lastActionIndex]: mrlResult.existed ? 'Sent to MRL (already existed)' : 'Sent to MRL (added new row)'
            };

            await this.excelService.updateRowByIndex('Step1_Review', rowIndex, updates);

            // Log the action
            await this.logProcessingAction(
                fileId, 
                step1Row.values[0][1], // File Name
                'routed_to_mrl', 
                'success', 
                mrlResult.existed ? 'Already existed in MRL' : 'Added to MRL table'
            );

            console.log(`Successfully routed FileID ${fileId} to MRL`);
            return true;

        } catch (error) {
            console.error(`Error in MRL routing for FileID ${fileId}:`, error);
            await this.logProcessingAction(fileId, step1Row.values[0][1], 'routed_to_mrl', 'error', error.message);
            throw error;
        }
    }

    async handleFastTrack(fileId, step1Row, rowIndex) {
        try {
            console.log(`Handling fast track for FileID: ${fileId}`);
            
            // Check if already processed (has Routed On date)
            const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
            const routedOn = step1Row.values[0][routedOnIndex];
            
            if (routedOn && routedOn.trim() !== '') {
                console.log(`FileID ${fileId} already fast-tracked (Routed On: ${routedOn})`);
                return false;
            }

            const fileName = step1Row.values[0][1]; // File Name

            // Step 1: Move the file to Final organization folder
            try {
                // Check if file still exists before moving
                const fileExists = await this.sharePointService.checkFileExists(fileId);
                if (!fileExists) {
                    throw new Error('File not found in SharePoint');
                }

                await this.sharePointService.moveFileToFinalOrg(fileId, fileName);
                console.log(`File ${fileName} moved to Final organization folder`);

            } catch (moveError) {
                console.error(`Error moving file ${fileName}:`, moveError);
                
                // Still update the Excel row to indicate attempt, but mark as error
                const now = new Date().toISOString();
                const lastActionIndex = this.excelService.getColumnIndex('Step1_Review', 'Last Action');
                const errorIndex = this.excelService.getColumnIndex('Step1_Review', 'Error');
                
                await this.excelService.updateRowByIndex('Step1_Review', rowIndex, {
                    [routedOnIndex]: now,
                    [lastActionIndex]: 'Fast-track attempted (file move failed)',
                    [errorIndex]: moveError.message
                });

                await this.logProcessingAction(fileId, fileName, 'fast_tracked', 'error', moveError.message);
                throw moveError;
            }

            // Step 2: Update Step1 row with fast-track information
            const now = new Date().toISOString();
            const lastActionIndex = this.excelService.getColumnIndex('Step1_Review', 'Last Action');
            const errorIndex = this.excelService.getColumnIndex('Step1_Review', 'Error');
            
            const updates = {
                [routedOnIndex]: now,
                [lastActionIndex]: 'Fast-tracked / moved to Final',
                [errorIndex]: '' // Clear any previous errors
            };

            await this.excelService.updateRowByIndex('Step1_Review', rowIndex, updates);

            // Log successful fast-track
            await this.logProcessingAction(fileId, fileName, 'fast_tracked', 'success', 'File moved to Final organization');

            console.log(`Successfully fast-tracked FileID ${fileId}`);
            return true;

        } catch (error) {
            console.error(`Error in fast track for FileID ${fileId}:`, error);
            await this.logProcessingAction(fileId, step1Row.values[0][1], 'fast_tracked', 'error', error.message);
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

    // Manual trigger for testing
    async manualStatusCheck() {
        console.log('Manual status check triggered');
        await this.processStatusChanges();
    }

    async getProcessingStats() {
        try {
            const stats = await this.db.collection('processing_logs').aggregate([
                {
                    $group: {
                        _id: { action: '$action', status: '$status' },
                        count: { $sum: 1 },
                        lastProcessed: { $max: '$timestamp' }
                    }
                }
            ]).toArray();

            return stats;
        } catch (error) {
            console.error('Error getting processing stats:', error);
            return [];
        }
    }
}

module.exports = StatusRouterService;