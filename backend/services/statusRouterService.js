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
            console.log('\n🔄 ===== STATUS ROUTER SERVICE - PROCESSING CYCLE =====');
            console.log(`📅 Started at: ${new Date().toISOString()}`);
            
            // Get all rows from Step1_Review table
            const step1Rows = await this.excelService.getAllTableRows('Step1_Review');
            console.log(`📋 Found ${step1Rows.length} total rows in Step1_Review table`);

            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            const processedFiles = [];
            const skippedFiles = [];
            const errorFiles = [];

            // DEBUG: Force show all rows regardless of enhanced logging working
            console.log('\n🔍 FORCING DEBUG OUTPUT FOR ALL ROWS:');
            for (const [index, row] of step1Rows.entries()) {
                const fileId = row.values[0][0];
                const fileName = row.values[0][1] || 'Unknown';
                const statusColumnIndex = this.excelService.getColumnIndex('Step1_Review', 'Status');
                const status = row.values[0][statusColumnIndex];
                const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
                const routedOn = row.values[0][routedOnIndex];
                
                console.log(`🔍 ROW ${index + 1} ANALYSIS:`);
                console.log(`   FileID: "${fileId}"`);
                console.log(`   FileName: "${fileName}"`);
                console.log(`   Status: "${status}" (column index: ${statusColumnIndex})`);
                console.log(`   RoutedOn: "${routedOn}" (column index: ${routedOnIndex})`);
                
                // Check what would trigger
                const triggerStatuses = ['Need MCL Review', 'Needs MCL Review', 'Needs Med/Reg/Leg Review', 'Needs MRL Review', 'Fast track'];
                const wouldTrigger = triggerStatuses.includes(status);
                const alreadyRouted = routedOn && routedOn.trim() !== '';
                
                console.log(`   Would trigger: ${wouldTrigger} (looking for: ${triggerStatuses.join(', ')})`);
                console.log(`   Already routed: ${alreadyRouted}`);
                console.log(`   Should process: ${wouldTrigger && !alreadyRouted}`);
            }
            console.log('🔍 END DEBUG OUTPUT\n');

            for (const [index, row] of step1Rows.entries()) {
                try {
                    const fileId = row.values[0][0]; // FileID in first column
                    const fileName = row.values[0][1] || 'Unknown'; // File Name
                    const status = row.values[0][this.excelService.getColumnIndex('Step1_Review', 'Status')];
                    const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
                    const routedOn = row.values[0][routedOnIndex];
                    
                    console.log(`\n📄 Row ${index + 1}: FileID="${fileId}", Name="${fileName}", Status="${status}"`);
                    
                    // Skip if no FileID or status
                    if (!fileId || !status) {
                        console.log(`⚠️  Skipping row ${index + 1}: Missing FileID or Status`);
                        skippedCount++;
                        skippedFiles.push({ index: index + 1, reason: 'Missing FileID or Status', fileName });
                        continue;
                    }

                    // Log current routing status
                    if (routedOn && routedOn.trim() !== '') {
                        console.log(`ℹ️  Already processed (Routed On: ${routedOn})`);
                    }

                    const processed = await this.processRowByStatus(fileId, status, row, index);
                    if (processed) {
                        processedCount++;
                        processedFiles.push({ fileId, fileName, status, action: 'processed' });
                        console.log(`✅ Successfully processed FileID: ${fileId}`);
                    } else {
                        skippedCount++;
                        skippedFiles.push({ fileId, fileName, status, reason: 'No action needed or already processed' });
                        console.log(`⏭️  Skipped FileID: ${fileId} (no action needed)`);
                    }

                } catch (error) {
                    console.error(`❌ Error processing row ${index + 1}:`, error.message);
                    errorCount++;
                    const fileId = row.values[0][0];
                    const fileName = row.values[0][1] || 'Unknown';
                    errorFiles.push({ fileId, fileName, error: error.message });
                    await this.logError('ROW_PROCESSING', error.message, fileId);
                }
            }

            // Summary logging
            console.log('\n📊 ===== PROCESSING SUMMARY =====');
            console.log(`✅ Processed: ${processedCount} files`);
            console.log(`⏭️  Skipped: ${skippedCount} files`);
            console.log(`❌ Errors: ${errorCount} files`);
            console.log(`📅 Completed at: ${new Date().toISOString()}`);
            
            if (processedFiles.length > 0) {
                console.log('\n🎯 FILES PROCESSED:');
                processedFiles.forEach(f => console.log(`   • ${f.fileId} - "${f.fileName}" (${f.status})`));
            }
            
            if (skippedFiles.length > 0) {
                console.log('\n⏭️  FILES SKIPPED:');
                skippedFiles.forEach(f => console.log(`   • ${f.fileId || 'N/A'} - "${f.fileName}" - ${f.reason}`));
            }
            
            if (errorFiles.length > 0) {
                console.log('\n❌ FILES WITH ERRORS:');
                errorFiles.forEach(f => console.log(`   • ${f.fileId || 'N/A'} - "${f.fileName}" - ${f.error}`));
            }

            console.log('🔄 ===== STATUS ROUTER CYCLE COMPLETE =====\n');

        } catch (error) {
            console.error('❌ Error processing status changes:', error);
            await this.logError('STATUS_PROCESSING', error.message);
            throw error;
        }
    }

    async processRowByStatus(fileId, status, row, rowIndex) {
        try {
            switch (status) {
                case 'Need MCL Review':
                case 'Needs MCL Review': // Current Excel format
                case 'Needs Med/Reg/Leg Review': // Legacy support
                case 'Needs MRL Review': // Legacy support
                    return await this.handleMCLRouting(fileId, row, rowIndex);
                
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

    async handleMCLRouting(fileId, step1Row, rowIndex) {
        try {
            const fileName = step1Row.values[0][1] || 'Unknown';
            console.log(`\n🔀 MCL ROUTING - FileID: ${fileId}, Name: "${fileName}"`);
            
            // Check if already processed (has Routed On date)
            const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
            const routedOn = step1Row.values[0][routedOnIndex];
            
            if (routedOn && routedOn.trim() !== '') {
                console.log(`   ⏸️  DUPLICATE PREVENTION: Already routed on ${routedOn}`);
                console.log(`   ➡️  SKIPPING: FileID ${fileId} to prevent duplicate processing`);
                return false;
            }

            console.log(`   🔍 CHECKING: Does FileID ${fileId} exist in MCL table?`);
            
            // Step 1: De-dup check and add to MCL table if needed
            const mclResult = await this.excelService.addToMCLIfNotExists(step1Row);
            
            if (mclResult.existed) {
                console.log(`   ✅ FOUND: FileID ${fileId} already exists in MCL table`);
            } else {
                console.log(`   ➕ ADDED: FileID ${fileId} newly added to MCL table`);
            }
            
            // Step 2: Update Step1 row with routing information
            const now = new Date().toISOString();
            const lastActionIndex = this.excelService.getColumnIndex('Step1_Review', 'Last Action');
            
            const updates = {
                [routedOnIndex]: now,
                [lastActionIndex]: mclResult.existed ? 'Sent to MCL (already existed)' : 'Sent to MCL (added new row)'
            };

            console.log(`   📝 UPDATING: Step1 row ${rowIndex + 1} with routing timestamp`);
            await this.excelService.updateRowByIndex('Step1_Review', rowIndex, updates);

            // Log the action to database
            await this.logProcessingAction(
                fileId, 
                fileName,
                'routed_to_mcl', 
                'success', 
                mclResult.existed ? 'Already existed in MCL' : 'Added to MCL table'
            );

            console.log(`   🎯 SUCCESS: FileID ${fileId} routing completed`);
            return true;

        } catch (error) {
            const fileName = step1Row.values[0][1] || 'Unknown';
            console.error(`   ❌ ERROR in MCL routing for FileID ${fileId}:`, error.message);
            await this.logProcessingAction(fileId, fileName, 'routed_to_mcl', 'error', error.message);
            throw error;
        }
    }

    async handleFastTrack(fileId, step1Row, rowIndex) {
        try {
            const fileName = step1Row.values[0][1] || 'Unknown';
            console.log(`\n⚡ FAST TRACK - FileID: ${fileId}, Name: "${fileName}"`);
            
            // Check if already processed (has Routed On date)
            const routedOnIndex = this.excelService.getColumnIndex('Step1_Review', 'Routed On');
            const routedOn = step1Row.values[0][routedOnIndex];
            
            if (routedOn && routedOn.trim() !== '') {
                console.log(`   ⏸️  DUPLICATE PREVENTION: Already fast-tracked on ${routedOn}`);
                console.log(`   ➡️  SKIPPING: FileID ${fileId} to prevent duplicate processing`);
                return false;
            }

            // Step 1: Move the file to Final organization folder
            try {
                console.log(`   🔍 CHECKING: Does file still exist in SharePoint?`);
                
                // Check if file still exists before moving
                const fileExists = await this.sharePointService.checkFileExists(fileId);
                if (!fileExists) {
                    throw new Error('File not found in SharePoint');
                }
                console.log(`   ✅ CONFIRMED: File exists in SharePoint`);

                console.log(`   📁 MOVING: "${fileName}" to Final organization folder`);
                await this.sharePointService.moveFileToFinalOrg(fileId, fileName);
                console.log(`   🎯 MOVED: File successfully moved to Final organization`);

            } catch (moveError) {
                console.error(`   ❌ MOVE FAILED: ${moveError.message}`);
                
                // Still update the Excel row to indicate attempt, but mark as error
                const now = new Date().toISOString();
                const lastActionIndex = this.excelService.getColumnIndex('Step1_Review', 'Last Action');
                const errorIndex = this.excelService.getColumnIndex('Step1_Review', 'Error');
                
                console.log(`   📝 UPDATING: Marking fast-track attempt with error`);
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

            console.log(`   📝 UPDATING: Step1 row ${rowIndex + 1} with fast-track completion`);
            await this.excelService.updateRowByIndex('Step1_Review', rowIndex, updates);

            // Log successful fast-track
            await this.logProcessingAction(fileId, fileName, 'fast_tracked', 'success', 'File moved to Final organization');

            console.log(`   🎯 SUCCESS: FileID ${fileId} fast-track completed`);
            return true;

        } catch (error) {
            const fileName = step1Row.values[0][1] || 'Unknown';
            console.error(`   ❌ ERROR in fast track for FileID ${fileId}:`, error.message);
            await this.logProcessingAction(fileId, fileName, 'fast_tracked', 'error', error.message);
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
        console.log('🚨 MANUAL STATUS CHECK TRIGGERED - ENHANCED DEBUG VERSION');
        console.log('🔍 Current timestamp:', new Date().toISOString());
        console.log('🏗️ Service running state:', this.isRunning);
        console.log('💾 Database connection:', this.db ? 'Connected' : 'Not connected');
        console.log('📊 Excel service state:', this.excelService ? 'Initialized' : 'Not initialized');
        console.log('📁 SharePoint service state:', this.sharePointService ? 'Initialized' : 'Not initialized');
        
        // Check if services are properly initialized
        if (!this.excelService) {
            throw new Error('Excel service not initialized');
        }
        if (!this.sharePointService) {
            throw new Error('SharePoint service not initialized');
        }
        if (!this.db) {
            throw new Error('Database connection not established');
        }
        
        console.log('🎯 About to call processStatusChanges()...');
        
        try {
            await this.processStatusChanges();
            console.log('✅ processStatusChanges() completed successfully');
        } catch (error) {
            console.error('❌ Error in processStatusChanges():', error);
            console.error('❌ Error type:', error.constructor.name);
            console.error('❌ Error stack:', error.stack);
            throw error;
        }
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
