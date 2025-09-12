const ArchiveService = require('./archiveService');
const ExcelService = require('./excelService');

class ArchiveProcessor {
    constructor() {
        this.archiveService = new ArchiveService();
        this.excelService = new ExcelService();
        this.isInitialized = false;
    }

    async initialize(accessToken) {
        if (this.isInitialized) {
            console.log('Archive processor already initialized');
            return true;
        }

        try {
            console.log('Initializing archive processor...');

            // Set access tokens
            this.archiveService.graphClientService.setAccessToken(accessToken);
            this.excelService.graphClientService.setAccessToken(accessToken);
            
            this.archiveService.graphClient = this.archiveService.graphClientService.getClient();
            this.excelService.graphClient = this.excelService.graphClientService.getClient();

            // Initialize services
            await this.archiveService.initialize();
            await this.excelService.initialize();

            this.isInitialized = true;
            console.log('Archive processor initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize archive processor:', error);
            throw error;
        }
    }

    async processArchive(sprintName) {
        if (!this.isInitialized) {
            throw new Error('Archive processor not initialized');
        }

        try {
            console.log(`Starting archive process for sprint: ${sprintName}`);
            
            const results = {
                sprintName,
                step1Rows: { processed: 0, errors: [] },
                mclRows: { processed: 0, errors: [] },
                filesProcessed: 0,
                filesErrors: [],
                summary: ''
            };

            // Step 1: Create or get sprint folder
            console.log('Creating/getting sprint folder...');
            const sprintFolderId = await this.archiveService.getOrCreateSprintFolder(sprintName);
            
            // Step 2: Get rows to archive from Step1_Review (Fast track status)
            console.log('Getting Step1 rows with Fast track status...');
            const step1Rows = await this.getStep1RowsToArchive();
            console.log(`Found ${step1Rows.length} Step1 rows to archive`);

            // Step 3: Get ALL rows from MCL_Review
            console.log('Getting all MCL review rows...');
            const mclRows = await this.getMCLRowsToArchive();
            console.log(`Found ${mclRows.length} MCL rows to archive`);

            // Step 4: Process files and update URLs
            const allRowsToProcess = [...step1Rows, ...mclRows];
            const fileOperations = [];

            for (const rowInfo of allRowsToProcess) {
                try {
                    const fileId = rowInfo.row.values[0][0]; // FileID column
                    const fileName = rowInfo.row.values[0][1]; // File Name column
                    const originalUrl = rowInfo.row.values[0][2]; // File URL column

                    console.log(`Processing file: ${fileName}`);

                    // Copy file to archive
                    const copyResult = await this.archiveService.copyFileToArchive(fileId, fileName, sprintFolderId);
                    fileOperations.push({
                        originalFileId: fileId,
                        fileName,
                        copyResult,
                        rowInfo
                    });

                    results.filesProcessed++;
                } catch (error) {
                    console.error(`Error processing file for row:`, error);
                    results.filesErrors.push({
                        fileName: rowInfo.row.values[0][1],
                        error: error.message
                    });
                }
            }

            // Step 5: Wait for file copies to complete and get new URLs
            console.log('Waiting for file copies to complete and updating URLs...');
            await this.delay(5000); // Wait 5 seconds for copies to initiate

            for (const fileOp of fileOperations) {
                try {
                    // Get the new file URL
                    let newUrl = await this.archiveService.getNewFileUrl(fileOp.fileName, sprintFolderId);
                    
                    // If URL not available yet, construct expected URL
                    if (!newUrl) {
                        newUrl = `[Archive URL - Copy in progress for ${fileOp.fileName}]`;
                    }

                    // Update the URL in the row data
                    fileOp.rowInfo.row.values[0][2] = newUrl;
                    
                    console.log(`Updated URL for ${fileOp.fileName}`);
                } catch (error) {
                    console.error(`Error updating URL for ${fileOp.fileName}:`, error);
                    results.filesErrors.push({
                        fileName: fileOp.fileName,
                        error: `URL update failed: ${error.message}`
                    });
                }
            }

            // Step 6: Add rows to archive sheet (MUST succeed before deletion)
            console.log('Adding rows to archive sheet...');
            let step1Archived = false;
            let mclArchived = false;
            
            if (step1Rows.length > 0) {
                try {
                    await this.archiveService.addRowsToArchiveSheet(
                        step1Rows.map(r => r.row), 
                        'Step1_Review'
                    );
                    results.step1Rows.processed = step1Rows.length;
                    step1Archived = true;
                } catch (error) {
                    console.error('Error adding Step1 rows to archive:', error);
                    results.step1Rows.errors.push(error.message);
                    // DO NOT DELETE if archive failed!
                }
            }

            if (mclRows.length > 0) {
                try {
                    await this.archiveService.addRowsToArchiveSheet(
                        mclRows.map(r => r.row), 
                        'MCL_Review'
                    );
                    results.mclRows.processed = mclRows.length;
                    mclArchived = true;
                } catch (error) {
                    console.error('Error adding MCL rows to archive:', error);
                    results.mclRows.errors.push(error.message);
                    // DO NOT DELETE if archive failed!
                }
            }

            // Step 7: Delete rows from original sheets ONLY if archive succeeded
            console.log('Deleting archived rows from original sheets (only if successfully archived)...');
            
            if (step1Rows.length > 0 && step1Archived) {
                try {
                    await this.archiveService.deleteRowsFromTable(
                        this.excelService, 
                        'Step1_Review', 
                        step1Rows
                    );
                    console.log(`Deleted ${step1Rows.length} rows from Step1_Review`);
                } catch (error) {
                    console.error('Error deleting Step1 rows:', error);
                    results.step1Rows.errors.push(`Deletion error: ${error.message}`);
                }
            } else if (step1Rows.length > 0 && !step1Archived) {
                console.log('⚠️ Skipping Step1 row deletion - archive failed!');
                results.step1Rows.errors.push('Rows NOT deleted due to archive failure - data preserved');
            }

            if (mclRows.length > 0 && mclArchived) {
                try {
                    await this.archiveService.deleteRowsFromTable(
                        this.excelService, 
                        'MCL_Review', 
                        mclRows
                    );
                    console.log(`Deleted ${mclRows.length} rows from MCL_Review`);
                } catch (error) {
                    console.error('Error deleting MCL rows:', error);
                    results.mclRows.errors.push(`Deletion error: ${error.message}`);
                }
            } else if (mclRows.length > 0 && !mclArchived) {
                console.log('⚠️ Skipping MCL row deletion - archive failed!');
                results.mclRows.errors.push('Rows NOT deleted due to archive failure - data preserved');
            }

            // Generate summary
            results.summary = this.generateSummary(results);
            
            console.log('Archive process completed');
            console.log(results.summary);
            
            return results;

        } catch (error) {
            console.error('Archive process failed:', error);
            throw error;
        }
    }

    async getStep1RowsToArchive() {
        try {
            const allRows = await this.excelService.getAllTableRows('Step1_Review');
            const fastTrackRows = [];

            allRows.forEach((row, index) => {
                // Status is in column 11 (0-indexed)
                const status = row.values[0][11];
                if (status && status.toLowerCase().includes('fast track')) {
                    fastTrackRows.push({ row, index });
                }
            });

            return fastTrackRows;
        } catch (error) {
            console.error('Error getting Step1 rows to archive:', error);
            throw error;
        }
    }

    async getMCLRowsToArchive() {
        try {
            const allRows = await this.excelService.getAllTableRows('MCL_Review');
            const rowsWithIndex = allRows.map((row, index) => ({ row, index }));
            return rowsWithIndex;
        } catch (error) {
            console.error('Error getting MCL rows to archive:', error);
            throw error;
        }
    }

    generateSummary(results) {
        const summary = [];
        summary.push(`Archive Process Summary for Sprint: ${results.sprintName}`);
        summary.push(`=====================================`);
        summary.push(`Step1_Review rows processed: ${results.step1Rows.processed}`);
        summary.push(`MCL_Review rows processed: ${results.mclRows.processed}`);
        summary.push(`Files processed: ${results.filesProcessed}`);
        
        if (results.step1Rows.errors.length > 0) {
            summary.push(`Step1 errors: ${results.step1Rows.errors.join(', ')}`);
        }
        
        if (results.mclRows.errors.length > 0) {
            summary.push(`MCL errors: ${results.mclRows.errors.join(', ')}`);
        }
        
        if (results.filesErrors.length > 0) {
            summary.push(`File errors: ${results.filesErrors.length}`);
            results.filesErrors.forEach(err => {
                summary.push(`  - ${err.fileName}: ${err.error}`);
            });
        }
        
        summary.push(`Total rows archived: ${results.step1Rows.processed + results.mclRows.processed}`);
        
        return summary.join('\n');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ArchiveProcessor;