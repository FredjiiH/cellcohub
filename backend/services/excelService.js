const GraphClientService = require('./graphClient');

class ExcelService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = null; // Will be initialized when access token is set
        
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
            const step1Path = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content_Review_step1 Test.xlsx';
            const step1File = await this.graphClient
                .api(`/sites/${this.siteId}/drive/root:${step1Path}`)
                .get();
            this.step1FileId = step1File.id;

            // Path to MCL Excel file
            const mrlPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content Review sheet Medical Compliance and Legal Test.xlsx';
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
            
            console.log(`Adding row to ${tableName}:`);
            console.log(`- File ID: ${fileId}`);
            console.log(`- Values array length: ${values.length}`);
            console.log(`- Values:`, values);
            
            // First, let's list all available tables
            try {
                const allTables = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables`)
                    .get();
                console.log(`\n\n🚨🚨🚨 EXCEL TABLES FOUND 🚨🚨🚨`);
                console.log(`📊 Available tables in Excel file:`, allTables.value.map(t => t.name));
                console.log(`🚨🚨🚨 END EXCEL TABLES 🚨🚨🚨\n\n`);
            } catch (tablesError) {
                console.log('❌ Could not list tables:', tablesError.message);
            }
            
            // Then try to get specific table info
            try {
                const tableInfo = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}`)
                    .get();
                console.log(`✅ Table ${tableName} info:`, {
                    columnCount: tableInfo.columns?.length || 'unknown',
                    rowCount: tableInfo.rowCount
                });
            } catch (tableError) {
                console.log(`❌ Could not get table ${tableName} info:`, tableError.message);
            }
            
            const response = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows`)
                .post({
                    values: [values]
                });

            console.log(`✅ Successfully added row to ${tableName}`);
            
            // Wait a moment for Excel to process the new row
            await this.delay(500);
            
            // Try to preserve/restore dropdown validation for Status column
            await this.preserveStatusDropdown(tableName, fileId);
            
            return response;
        } catch (error) {
            console.error(`❌ Error adding row to table ${tableName}:`, error);
            console.error('Error details:', error.message);
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

    async addToMCLIfNotExists(step1Row) {
        try {
            const fileId = step1Row.values[0][0]; // Assuming FileID is first column
            
            // Check if already exists in MCL table
            const existingRow = await this.findRowByFileId('MCL_Review', fileId);
            
            if (existingRow) {
                console.log(`Row with FileID ${fileId} already exists in MCL_Review`);
                return { existed: true, row: existingRow };
            }

            // Map Step1 values to correct MCL positions
            const step1Values = step1Row.values[0];
            
            // MCL sheet structure: columns 0-12 same as Step1, then reviewer columns, then last 3 columns
            const mclValues = [
                // Columns 0-12: Copy from Step1 (same structure)
                step1Values[0],  // 0: FileID
                step1Values[1],  // 1: File Name
                step1Values[2],  // 2: File URL
                step1Values[3],  // 3: Purpose
                step1Values[4],  // 4: Target audience
                step1Values[5],  // 5: Descriptive Name
                step1Values[6],  // 6: Version Date
                step1Values[7],  // 7: Version
                step1Values[8],  // 8: Uploader
                step1Values[9],  // 9: Created
                step1Values[10], // 10: Priority
                step1Values[11], // 11: Status
                step1Values[12], // 12: Michael Comment
                
                // Columns 13-18: MCL reviewer-specific columns
                '',              // 13: Medical Comment
                'Not assessed',  // 14: Medical Risk
                '',              // 15: Regulatory Comment
                'Not assessed',  // 16: Regulatory Risk
                '',              // 17: Legal Comment
                'Not assessed',  // 18: Legal Risk
                
                // Columns 19-21: Last 3 columns (same as Step1 but different positions)
                '',              // 19: Routed On (Step1 col 13 -> MCL col 19)
                'Sent to MCL',   // 20: Last Action (Step1 col 14 -> MCL col 20)
                ''               // 21: Error (Step1 col 15 -> MCL col 21)
            ];

            const result = await this.addRowToTable('MCL_Review', mclValues);
            console.log(`Added new row to MCL_Review for FileID ${fileId}`);
            
            return { existed: false, row: result };
        } catch (error) {
            console.error('Error adding to MCL table:', error);
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async preserveStatusDropdown(tableName, fileId) {
        try {
            console.log(`🔄 Attempting to preserve Status dropdown for ${tableName}...`);
            
            // The fundamental issue: Excel tables don't always preserve data validation 
            // when rows are added programmatically. Let's try a workaround.
            
            const statusColumnIndex = this.getColumnIndex(tableName, 'Status');
            if (statusColumnIndex === undefined) {
                console.log('Status column not found, skipping');
                return;
            }

            // Get all existing rows to see if any have validation we can copy
            const rows = await this.getAllTableRows(tableName);
            console.log(`Found ${rows.length} existing rows in ${tableName}`);
            
            if (rows.length > 1) {
                // Try to copy validation from the first data row (not header)
                const firstDataRowIndex = 1; // Skip header row
                const columnLetter = this.getColumnLetter(statusColumnIndex);
                
                try {
                    // Get validation from existing row
                    const existingCellAddress = `${columnLetter}${firstDataRowIndex + 1}`; // +1 because Excel is 1-indexed
                    const existingValidation = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets/Sheet1/range(address='${existingCellAddress}')/dataValidation`)
                        .get();
                    
                    console.log('Found existing validation:', existingValidation.type, existingValidation.source);
                    
                    // Apply this validation to the entire column
                    const columnRange = `${columnLetter}:${columnLetter}`;
                    await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets/Sheet1/range(address='${columnRange}')/dataValidation`)
                        .put({
                            type: existingValidation.type,
                            source: existingValidation.source,
                            allowBlank: existingValidation.allowBlank,
                            showInputMessage: existingValidation.showInputMessage,
                            inputTitle: existingValidation.inputTitle,
                            inputMessage: existingValidation.inputMessage,
                            showErrorMessage: existingValidation.showErrorMessage,
                            errorTitle: existingValidation.errorTitle,
                            errorMessage: existingValidation.errorMessage
                        });
                    
                    console.log(`✅ Successfully copied validation to entire ${columnLetter} column`);
                    return;
                    
                } catch (copyError) {
                    console.log(`Could not copy existing validation: ${copyError.message}`);
                    // Fall back to applying fresh validation
                }
            }
            
            // Fallback: apply fresh validation
            await this.applyFreshStatusValidation(tableName, fileId);
            
        } catch (error) {
            console.error(`❌ Error preserving dropdown for ${tableName}:`, error.message);
        }
    }

    async applyFreshStatusValidation(tableName, fileId) {
        try {
            console.log(`📝 Applying fresh validation to ${tableName}...`);
            
            const statusOptions = tableName === 'Step1_Review' 
                ? ['Pending Michael Review', 'Need MCL Review', 'Fast track', 'Rejected']
                : ['In Progress', 'Completed', 'On Hold'];

            const statusColumnIndex = this.getColumnIndex(tableName, 'Status');
            const columnLetter = this.getColumnLetter(statusColumnIndex);
            
            // Apply to a large range to cover current and future rows
            const range = `${columnLetter}2:${columnLetter}1000`;
            
            const validationRule = {
                type: 'List',
                source: statusOptions.join(','),
                allowBlank: false,
                showInputMessage: true,
                inputTitle: 'Status',
                inputMessage: 'Select a status from the dropdown',
                showErrorMessage: true,
                errorTitle: 'Invalid Status', 
                errorMessage: 'Please choose a valid status option'
            };

            await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets/Sheet1/range(address='${range}')/dataValidation`)
                .put(validationRule);

            console.log(`✅ Applied fresh validation to range ${range} in ${tableName}`);

        } catch (error) {
            console.error(`❌ Fresh validation failed for ${tableName}:`, error.message);
            
            // Ultimate fallback: document the limitation
            console.log('⚠️ Excel table validation limitation detected.');
            console.log('   The dropdown may need to be manually restored in Excel.');
            console.log('   This is a known limitation when adding rows programmatically to Excel tables.');
        }
    }

    getColumnLetter(columnIndex) {
        let result = '';
        let index = columnIndex;
        
        while (index >= 0) {
            result = String.fromCharCode(65 + (index % 26)) + result;
            index = Math.floor(index / 26) - 1;
        }
        
        return result;
    }

    // Column mapping helpers for easier maintenance
    getColumnIndex(tableName, columnName) {
        const columnMaps = {
            'Step1_Review': {
                'FileID': 0,
                'File Name': 1,
                'File URL': 2,
                'Purpose': 3,
                'Target audience': 4,
                'Descriptive Name': 5,
                'Version Date': 6,
                'Version': 7,
                'Uploader': 8,
                'Created': 9,
                'Priority': 10,
                'Status': 11,
                'Michael Comment': 12,
                'Routed On': 13,
                'Last Action': 14,
                'Error': 15
            },
            'MCL_Review': {
                'FileID': 0,
                'File Name': 1,
                'File URL': 2,
                'Purpose': 3,
                'Target audience': 4,
                'Descriptive Name': 5,
                'Version Date': 6,
                'Version': 7,
                'Uploader': 8,
                'Created': 9,
                'Priority': 10,
                'Status': 11,
                'Michael Comment': 12,
                'Medical Comment': 13,
                'Medical Risk': 14,
                'Regulatory Comment': 15,
                'Regulatory Risk': 16,
                'Legal Comment': 17,
                'Legal Risk': 18,
                'Routed On': 19,
                'Last Action': 20,
                'Error': 21
            }
        };

        return columnMaps[tableName]?.[columnName];
    }
}

module.exports = ExcelService;