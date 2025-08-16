const GraphClientService = require('./graphClient');

class ExcelService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = this.graphClientService.getClient();
        
        // SharePoint site and file configuration
        this.siteId = null; // Will be resolved from site URL
        this.driveId = null; // Will be resolved from site
        this.step1FileId = null; // Content_Review_step1.xlsx
        this.mrlFileId = null; // Content Review sheet Medical Regulatory and Legal.xlsx
    }

    async initialize() {
        try {
            // Resolve site ID from URL
            const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
            const site = await this.graphClient.api(`/sites/${siteUrl}`).get();
            this.siteId = site.id;

            // Get the default drive (Documents library)
            const drive = await this.graphClient.api(`/sites/${this.siteId}/drive`).get();
            this.driveId = drive.id;

            // Resolve Excel file IDs
            await this.resolveFileIds();
            
            console.log('Excel service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Excel service:', error);
            throw error;
        }
    }

    async resolveFileIds() {
        try {
            // Path to Step 1 Excel file
            const step1Path = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content_Review_step1.xlsx';
            const step1File = await this.graphClient
                .api(`/sites/${this.siteId}/drive/root:${step1Path}`)
                .get();
            this.step1FileId = step1File.id;

            // Path to MRL Excel file
            const mrlPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content Review sheet Medical Regulatory and Legal.xlsx';
            const mrlFile = await this.graphClient
                .api(`/sites/${this.siteId}/drive/root:${mrlPath}`)
                .get();
            this.mrlFileId = mrlFile.id;

            console.log('Excel file IDs resolved:', { step1FileId: this.step1FileId, mrlFileId: this.mrlFileId });
        } catch (error) {
            console.error('Error resolving Excel file IDs:', error);
            throw error;
        }
    }

    async getAllTableRows(tableName) {
        try {
            const fileId = tableName === 'Step1_Review' ? this.step1FileId : this.mrlFileId;
            
            const response = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows`)
                .get();

            return response.value || [];
        } catch (error) {
            console.error(`Error getting rows from table ${tableName}:`, error);
            throw error;
        }
    }

    async addRowToTable(tableName, values) {
        try {
            const fileId = tableName === 'Step1_Review' ? this.step1FileId : this.mrlFileId;
            
            const response = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows`)
                .post({
                    values: [values]
                });

            console.log(`Added row to ${tableName}:`, values);
            return response;
        } catch (error) {
            console.error(`Error adding row to table ${tableName}:`, error);
            throw error;
        }
    }

    async findRowByFileId(tableName, fileId) {
        try {
            const rows = await this.getAllTableRows(tableName);
            
            // FileID is typically in the first column (index 0)
            const rowIndex = rows.findIndex(row => row.values[0][0] === fileId);
            
            if (rowIndex !== -1) {
                return {
                    index: rowIndex,
                    row: rows[rowIndex]
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Error finding row by FileID in ${tableName}:`, error);
            throw error;
        }
    }

    async updateRowByIndex(tableName, rowIndex, updates) {
        try {
            const fileId = tableName === 'Step1_Review' ? this.step1FileId : this.mrlFileId;
            
            // Get current row to merge updates
            const currentRow = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows/itemAt(index=${rowIndex})`)
                .get();

            // Merge updates with current values
            const newValues = [...currentRow.values[0]];
            Object.keys(updates).forEach(columnIndex => {
                newValues[columnIndex] = updates[columnIndex];
            });

            const response = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows/itemAt(index=${rowIndex})`)
                .patch({
                    values: [newValues]
                });

            console.log(`Updated row ${rowIndex} in ${tableName}:`, updates);
            return response;
        } catch (error) {
            console.error(`Error updating row in ${tableName}:`, error);
            
            // Handle concurrency conflicts
            if (error.code === 'Conflict' || error.status === 409) {
                console.log('Detected conflict, retrying after delay...');
                await this.delay(Math.random() * 3000 + 1000); // 1-4 second delay
                return this.updateRowByIndex(tableName, rowIndex, updates);
            }
            
            throw error;
        }
    }

    async updateRowByFileId(tableName, fileId, updates) {
        try {
            const rowInfo = await this.findRowByFileId(tableName, fileId);
            
            if (!rowInfo) {
                throw new Error(`Row with FileID ${fileId} not found in ${tableName}`);
            }

            return await this.updateRowByIndex(tableName, rowInfo.index, updates);
        } catch (error) {
            console.error(`Error updating row by FileID in ${tableName}:`, error);
            throw error;
        }
    }

    async addToMRLIfNotExists(step1Row) {
        try {
            const fileId = step1Row.values[0][0]; // Assuming FileID is first column
            
            // Check if already exists in MRL table
            const existingRow = await this.findRowByFileId('MRL_Review', fileId);
            
            if (existingRow) {
                console.log(`Row with FileID ${fileId} already exists in MRL_Review`);
                return { existed: true, row: existingRow };
            }

            // Copy Step1 values and add MRL-specific columns
            const step1Values = step1Row.values[0];
            const mrlValues = [
                ...step1Values, // Copy all Step1 columns
                '', // Medical Comment
                'Not assessed', // Medical Risk
                '', // Regulatory Comment  
                'Not assessed', // Regulatory Risk
                '', // Legal Comment
                'Not assessed' // Legal Risk
            ];

            const result = await this.addRowToTable('MRL_Review', mrlValues);
            console.log(`Added new row to MRL_Review for FileID ${fileId}`);
            
            return { existed: false, row: result };
        } catch (error) {
            console.error('Error adding to MRL table:', error);
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Column mapping helpers for easier maintenance
    getColumnIndex(tableName, columnName) {
        const columnMaps = {
            'Step1_Review': {
                'FileID': 0,
                'File Name': 1,
                'File URL': 2,
                'Purpose': 3,
                'Descriptive Name': 4,
                'Version Date': 5,
                'Version': 6,
                'Uploader': 7,
                'Created': 8,
                'Priority': 9,
                'Status': 10,
                'Micke Notes': 11,
                'Routed On': 12,
                'Last Action': 13,
                'Error': 14
            },
            'MRL_Review': {
                'FileID': 0,
                'File Name': 1,
                'File URL': 2,
                'Purpose': 3,
                'Descriptive Name': 4,
                'Version Date': 5,
                'Version': 6,
                'Uploader': 7,
                'Created': 8,
                'Priority': 9,
                'Status': 10,
                'Micke Notes': 11,
                'Medical Comment': 12,
                'Medical Risk': 13,
                'Regulatory Comment': 14,
                'Regulatory Risk': 15,
                'Legal Comment': 16,
                'Legal Risk': 17,
                'Routed On': 18,
                'Last Action': 19,
                'Error': 20
            }
        };

        return columnMaps[tableName]?.[columnName];
    }
}

module.exports = ExcelService;