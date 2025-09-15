const GraphClientService = require('./graphClient');

class ExcelService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = null; // Will be initialized when access token is set

        // Deployment verification - DEPLOYED VERSION 2025-09-15-v7-WORKSHEET-FIX
        console.log('🚀 ExcelService initialized - Version 2025-09-15-v7 - Fixed worksheet names and validation table discovery on Lists worksheet');
        
        // SharePoint site and file configuration
        this.siteId = null; // Will be resolved from site URL
        this.driveId = null; // Will be resolved from site
        this.step1FileId = null; // Content_Review_step1.xlsx
        this.mrlFileId = null; // Content Review sheet Medical Regulatory and Legal.xlsx
        
        // Track which tables have been formatted in this session (removed for reliability)
        // this.formattedTables = new Set();
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

            // Path to MCL Excel file
            const mrlPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content Review sheet Medical Compliance and Legal.xlsx';
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
            
            // First, let's list all available tables and worksheets
            try {
                const allTables = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables`)
                    .get();
                console.log(`\n\n🚨🚨🚨 EXCEL TABLES FOUND 🚨🚨🚨`);
                console.log(`📊 Available tables in Excel file:`, allTables.value.map(t => t.name));

                // Also list worksheets to understand structure better
                try {
                    const worksheets = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets`)
                        .get();
                    console.log(`📑 Available worksheets:`, worksheets.value.map(w => w.name));
                } catch (wsError) {
                    console.log('Could not list worksheets:', wsError.message);
                }

                console.log(`🚨🚨🚨 END EXCEL TABLES 🚨🚨🚨\n\n`);
            } catch (tablesError) {
                console.log('❌ Could not list tables:', tablesError.message);
            }
            
            // Then try to get specific table info and columns
            let expectedColumnCount = null;
            try {
                const tableInfo = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}`)
                    .get();
                
                // Get column information
                const columnsResponse = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns`)
                    .get();
                
                expectedColumnCount = columnsResponse.value.length;
                console.log(`✅ Table ${tableName} info:`, {
                    columnCount: expectedColumnCount,
                    rowCount: tableInfo.rowCount,
                    columnNames: columnsResponse.value.map(col => col.name)
                });
                
                // Warn if column count mismatch
                if (expectedColumnCount !== values.length) {
                    console.log(`⚠️  COLUMN COUNT MISMATCH: Table expects ${expectedColumnCount} columns, but received ${values.length} values`);
                    console.log(`📊 Expected columns: ${columnsResponse.value.map(col => col.name).join(', ')}`);
                    
                    // Adjust values array to match table structure
                    if (values.length > expectedColumnCount) {
                        console.log(`🔧 Truncating values array from ${values.length} to ${expectedColumnCount}`);
                        values = values.slice(0, expectedColumnCount);
                    } else {
                        console.log(`🔧 Padding values array from ${values.length} to ${expectedColumnCount} with empty strings`);
                        while (values.length < expectedColumnCount) {
                            values.push('');
                        }
                    }
                    console.log(`🔧 Adjusted values:`, values);
                }
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
            
            // Try to preserve/restore dropdown validation for Status and Priority columns
            await this.preserveDataValidation(tableName, fileId);
            
            // Format comment columns on every row addition for reliability (V2 FIX)
            console.log(`🎨 V2 FIX: Formatting comment columns for ${tableName}...`);
            await this.formatCommentColumns(tableName, fileId);
            
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

    async preserveDataValidation(tableName, fileId) {
        try {
            console.log(`🔄 Attempting to preserve data validation for ${tableName}...`);

            // Define which columns need validation based on the table
            let validationColumns = ['Status', 'Priority'];

            // Add Risk columns for MCL sheet
            if (tableName === 'MCL_Review') {
                validationColumns.push('Medical Risk', 'Regulatory Risk', 'Legal Risk');
            }

            for (const columnName of validationColumns) {
                const columnIndex = this.getColumnIndex(tableName, columnName);
                if (columnIndex === undefined) {
                    console.log(`${columnName} column not found in ${tableName}, skipping`);
                    continue;
                }

                await this.applyColumnValidation(tableName, fileId, columnName, columnIndex);
            }
        } catch (error) {
            console.error(`❌ Error preserving data validation for ${tableName}:`, error.message);
        }
    }

    async applyColumnValidation(tableName, fileId, columnName, columnIndex) {
        try {
            console.log(`🔄 Applying ${columnName} validation for table ${tableName}...`);

            // Map column names to their validation source tables
            // Step1 sheet tables: Step1_Review (main), Status, Priority
            // MCL sheet tables: MCL_Review (main), MCLStatus, PriorityValues, RiskScale
            let validationTableName;
            let fallbackOptions;

            if (columnName === 'Status') {
                if (tableName === 'Step1_Review') {
                    validationTableName = 'Status';  // Table in Step1 sheet
                    fallbackOptions = ['Pending Michael Review', 'Need MCL Review', 'Fast track', 'Rejected'];
                } else if (tableName === 'MCL_Review') {
                    validationTableName = 'MCLStatus';  // Table in MCL sheet
                    fallbackOptions = ['In Progress', 'Completed', 'On Hold'];
                }
            } else if (columnName === 'Priority') {
                if (tableName === 'Step1_Review') {
                    validationTableName = 'Priority';  // Table in Step1 sheet
                } else if (tableName === 'MCL_Review') {
                    validationTableName = 'PriorityValues';  // Table in MCL sheet
                }
                fallbackOptions = ['Low', 'Normal', 'High', 'Urgent'];
            } else if (columnName.includes('Risk')) {
                // For Medical Risk, Regulatory Risk, Legal Risk columns in MCL
                validationTableName = 'RiskScale';
                fallbackOptions = ['Not assessed', 'Low', 'Medium', 'High'];
            } else {
                console.log(`⚠️ No validation mapping for column ${columnName}`);
                return;
            }

            try {
                // First, try to reference the validation table directly
                if (validationTableName) {
                    console.log(`📊 Attempting to use validation table: ${validationTableName}`);

                    // First check if table exists on Lists worksheet
                    try {
                        // Try to get tables from Lists worksheet specifically
                        const listsWorksheetTables = await this.graphClient
                            .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets('Lists')/tables`)
                            .get();

                        console.log(`📋 Tables on Lists worksheet:`, listsWorksheetTables.value.map(t => t.name));

                        // Check if our validation table is there
                        const hasValidationTable = listsWorksheetTables.value.some(t => t.name === validationTableName);
                        if (hasValidationTable) {
                            console.log(`✅ Found ${validationTableName} table on Lists worksheet`);
                        }
                    } catch (listsError) {
                        console.log(`⚠️ Could not check Lists worksheet: ${listsError.message}`);
                    }

                    // Get the validation table's data range
                    const validationTableRange = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${validationTableName}/dataBodyRange`)
                        .get();

                    console.log(`✅ Found validation table ${validationTableName} at range: ${validationTableRange.address}`);

                    // Apply validation using the table reference
                    const apiUrl = `/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns('${columnName}')/dataBodyRange`;
                    console.log(`📡 Applying validation to column via: ${apiUrl}`);

                    // If validation table is on Lists worksheet, use proper reference
                    const tableReference = validationTableRange.address.includes('Lists!')
                        ? `=Lists.${validationTableName}[${validationTableName}]`  // Reference table on Lists worksheet
                        : `=${validationTableName}[${validationTableName}]`;       // Reference table on same worksheet

                    const validationRule = {
                        type: 'List',
                        source: tableReference,
                        allowBlank: columnName === 'Priority',
                        showInputMessage: true,
                        inputTitle: columnName,
                        inputMessage: `Select a ${columnName.toLowerCase()} from the dropdown`,
                        showErrorMessage: true,
                        errorTitle: `Invalid ${columnName}`,
                        errorMessage: `Please choose a valid ${columnName.toLowerCase()} option`
                    };

                    await this.graphClient
                        .api(apiUrl)
                        .patch({
                            dataValidation: validationRule
                        });

                    console.log(`✅ Successfully applied ${columnName} validation using table ${validationTableName}`);
                    return;
                }
            } catch (tableRefError) {
                console.log(`⚠️ Could not use table reference for validation: ${tableRefError.message}`);
                console.log(`🔄 Falling back to direct list values...`);
            }

            // Fallback to using direct list values
            try {
                const apiUrl = `/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns('${columnName}')/dataBodyRange`;
                console.log(`📡 Applying validation with direct values via: ${apiUrl}`);

                const validationRule = {
                    type: 'List',
                    source: fallbackOptions.join(','),
                    allowBlank: columnName === 'Priority',
                    showInputMessage: true,
                    inputTitle: columnName,
                    inputMessage: `Select a ${columnName.toLowerCase()} from the dropdown`,
                    showErrorMessage: true,
                    errorTitle: `Invalid ${columnName}`,
                    errorMessage: `Please choose a valid ${columnName.toLowerCase()} option`
                };

                await this.graphClient
                    .api(apiUrl)
                    .patch({
                        dataValidation: validationRule
                    });

                console.log(`✅ Successfully applied ${columnName} validation using direct list values`);

            } catch (tableApiError) {
                console.log(`⚠️ Table column API failed, trying with column index...`);

                try {
                    // Try using column index instead of name
                    const apiUrl = `/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns/itemAt(index=${columnIndex})/dataBodyRange`;

                    const validationRule = {
                        type: 'List',
                        source: options.join(','),
                        allowBlank: columnName === 'Priority',
                        showInputMessage: true,
                        inputTitle: columnName,
                        inputMessage: `Select a ${columnName.toLowerCase()} from the dropdown`,
                        showErrorMessage: true,
                        errorTitle: `Invalid ${columnName}`,
                        errorMessage: `Please choose a valid ${columnName.toLowerCase()} option`
                    };

                    await this.graphClient
                        .api(apiUrl)
                        .patch({
                            dataValidation: validationRule
                        });

                    console.log(`✅ Successfully applied ${columnName} validation using column index`);

                } catch (indexError) {
                    console.log(`⚠️ Column index approach failed, trying worksheet range...`);

                    // Last resort: try to get table info and use worksheet range
                    try {
                        const tableInfo = await this.graphClient
                            .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}`)
                            .get();

                        const worksheetName = tableInfo.worksheet?.name || 'Sheet1';
                        const columnLetter = this.getColumnLetter(columnIndex);
                        const range = `${columnLetter}2:${columnLetter}1000`;

                        const validationRule = {
                            type: 'List',
                            source: options.join(','),
                            allowBlank: columnName === 'Priority',
                            showInputMessage: true,
                            inputTitle: columnName,
                            inputMessage: `Select a ${columnName.toLowerCase()} from the dropdown`,
                            showErrorMessage: true,
                            errorTitle: `Invalid ${columnName}`,
                            errorMessage: `Please choose a valid ${columnName.toLowerCase()} option`
                        };

                        await this.graphClient
                            .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets('${worksheetName}')/range(address='${range}')`)
                            .patch({
                                dataValidation: validationRule
                            });

                        console.log(`✅ Successfully applied ${columnName} validation using worksheet range`);

                    } catch (worksheetError) {
                        console.error(`❌ All attempts to apply ${columnName} validation failed:`, worksheetError.message);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ Error applying ${columnName} validation:`, error.message);
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
                'FileID': 0,                    // 1. FileID (system)
                'File Name': 1,                 // 2. File Name  
                'File URL': 2,                  // 3. File URL
                'Target audience': 3,           // 4. Target audience
                'Purpose': 4,                   // 5. Purpose
                'Descriptive Name': 5,          // 6. Descriptive Name
                'Version Date': 6,              // 7. Version Date
                'Version': 7,                   // 8. Version
                'Uploader': 8,                  // 9. Uploader
                'Created': 9,                   // 10. Created
                'Priority': 10,                 // 11. Priority
                'Status': 11,                   // 12. Status
                'Michael Comment': 12,          // 13. Michael Comment
                'Routed On': 13,                 // 14. Routed On (system)
                'Last Action': 14,              // 15. Last Action (system)
                'Error': 15                      // 16. Error (system)
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

    async formatCommentColumns(tableName, fileId) {
        try {
            console.log(`🎨 Formatting comment columns for ${tableName} with fileId: ${fileId}...`);

            // Define comment columns for each table
            const commentColumnsByTable = {
                'Step1_Review': ['Michael Comment'],
                'MCL_Review': ['Michael Comment', 'Medical Comment', 'Regulatory Comment', 'Legal Comment']
            };

            const commentColumns = commentColumnsByTable[tableName];
            console.log(`📊 Comment columns for ${tableName}:`, commentColumns);

            if (!commentColumns) {
                console.log(`❌ No comment columns defined for table ${tableName}`);
                return;
            }

            for (const columnName of commentColumns) {
                const columnIndex = this.getColumnIndex(tableName, columnName);
                console.log(`🔍 Column ${columnName}: index=${columnIndex}`);

                if (columnIndex !== undefined) {
                    console.log(`🎨 Formatting column ${columnName} (index: ${columnIndex}) in table ${tableName}`);

                    try {
                        // First, get the table range to determine actual data range
                        const tableInfo = await this.graphClient
                            .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}`)
                            .get();

                        // Log full table info to debug undefined range
                        console.log(`📊 Table ${tableName} info:`, {
                            name: tableInfo.name,
                            address: tableInfo.address,
                            showHeaders: tableInfo.showHeaders,
                            showTotals: tableInfo.showTotals,
                            style: tableInfo.style
                        });

                        // Get the specific column data range from the table
                        const columnData = await this.graphClient
                            .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns('${columnName}')/dataBodyRange`)
                            .get();

                        console.log(`📍 Column ${columnName} data range: ${columnData.address}`);

                        // Check if there's data to format
                        if (!columnData.address || columnData.rowCount === 0) {
                            console.log(`⚠️ No data rows to format in column ${columnName}`);
                            continue;
                        }

                        // Apply formatting to the column's data body range
                        const apiUrl = `/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns('${columnName}')/dataBodyRange`;
                        console.log(`📡 API call: PATCH ${apiUrl}`);

                        // Use simplified format object to avoid API errors
                        await this.graphClient
                            .api(apiUrl)
                            .patch({
                                format: {
                                    wrapText: true
                                }
                            });

                        console.log(`✅ Successfully formatted column ${columnName} in table ${tableName}`);

                        // Also try to format the header for this column
                        try {
                            await this.graphClient
                                .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns('${columnName}')/headerRowRange`)
                                .patch({
                                    format: {
                                        wrapText: true,
                                        verticalAlignment: 'Center',
                                        horizontalAlignment: 'Center',
                                        fill: {
                                            color: '#F0F0F0'
                                        }
                                    }
                                });
                            console.log(`✅ Also formatted header for ${columnName}`);
                        } catch (headerError) {
                            console.log(`⚠️ Could not format header for ${columnName}: ${headerError.message}`);
                        }

                        // Small delay to prevent API throttling
                        await this.delay(200);

                    } catch (columnError) {
                        console.error(`❌ Error formatting column ${columnName}:`, columnError.message);

                        // Try alternative approach using column index
                        try {
                            console.log(`🔄 Trying alternative formatting approach using column index for ${columnName}...`);

                            // Use column index instead of name
                            const apiUrl = `/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/columns/itemAt(index=${columnIndex})/dataBodyRange`;
                            console.log(`📡 Alternative API call: PATCH ${apiUrl}`);

                            await this.graphClient
                                .api(apiUrl)
                                .patch({
                                    format: {
                                        wrapText: true
                                    }
                                });

                            console.log(`✅ Alternative formatting successful for ${columnName} using index ${columnIndex}`);

                        } catch (altError) {
                            console.error(`❌ Alternative formatting also failed for ${columnName}:`, altError.message);

                            // Last resort: try to get table address and format using worksheet range
                            try {
                                console.log(`🔄 Final attempt: Getting table info to use worksheet range...`);

                                const tableInfo = await this.graphClient
                                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/tables/${tableName}`)
                                    .get();

                                // Extract worksheet name from table info if available
                                // For Step1_Review table, the worksheet is 'Step1', not 'Sheet1'
                                const worksheetName = tableInfo.worksheet?.name || (tableName === 'Step1_Review' ? 'Step1' : 'Sheet1');
                                const columnLetter = this.getColumnLetter(columnIndex);

                                console.log(`📝 Using worksheet ${worksheetName}, column ${columnLetter}`);

                                // Try to format using worksheet range - simplified format
                                await this.graphClient
                                    .api(`/sites/${this.siteId}/drive/items/${fileId}/workbook/worksheets('${worksheetName}')/range(address='${columnLetter}2:${columnLetter}1000')`)
                                    .patch({
                                        format: {
                                            wrapText: true
                                        }
                                    });

                                console.log(`✅ Final attempt successful for ${columnName}`);

                            } catch (finalError) {
                                console.error(`❌ All formatting attempts failed for ${columnName}:`, finalError.message);
                            }
                        }
                    }
                } else {
                    console.log(`⚠️  Column ${columnName} not found in ${tableName}, skipping formatting`);
                }
            }

            console.log(`✅ Comment column formatting completed for ${tableName}`);

        } catch (error) {
            console.error(`❌ Error formatting comment columns for ${tableName}:`, error.message);
            // Don't throw - formatting is nice-to-have, not critical
        }
    }

}

module.exports = ExcelService;