const GraphClientService = require('./graphClient');

class ArchiveService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = null; // Will be initialized when access token is set
        
        // SharePoint site and file configuration
        this.siteId = null;
        this.driveId = null;
        this.archiveFileId = null; // Content Review Sheet Archive.xlsx
        this.archivesFolderId = null; // Archives folder
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

            // Resolve file and folder IDs
            await this.resolveFileIds();
            
            console.log('Archive service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Archive service:', error);
            throw error;
        }
    }

    async resolveFileIds() {
        try {
            // Path to Archive Excel file
            // The file is in the Archives folder
            const archivePath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives/Content Review sheet Archives.xlsx';
            try {
                const archiveFile = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${archivePath}`)
                    .get();
                this.archiveFileId = archiveFile.id;
            } catch (error) {
                console.log('Archive Excel file not found at expected path, trying alternative paths...');
                
                // Try alternative path with different casing
                const altPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content Review sheet Archive.xlsx';
                try {
                    const archiveFile = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/root:${altPath}`)
                        .get();
                    this.archiveFileId = archiveFile.id;
                    console.log('Archive Excel file found at alternative path');
                } catch (altError) {
                    console.error('Archive Excel file not found at any known paths');
                    this.archiveFileId = null;
                }
            }

            // Path to Archives folder
            const archivesFolderPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives';
            try {
                const archivesFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${archivesFolderPath}`)
                    .get();
                this.archivesFolderId = archivesFolder.id;
            } catch (error) {
                // Create Archives folder if it doesn't exist
                console.log('Archives folder not found, creating...');
                const parentPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval';
                const parentFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${parentPath}`)
                    .get();
                
                const newFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${parentFolder.id}/children`)
                    .post({
                        name: 'Archives',
                        folder: {},
                        '@microsoft.graph.conflictBehavior': 'rename'
                    });
                
                this.archivesFolderId = newFolder.id;
                console.log('Created Archives folder');
            }

            console.log('Archive service file IDs resolved:', { 
                archiveFileId: this.archiveFileId, 
                archivesFolderId: this.archivesFolderId 
            });
        } catch (error) {
            console.error('Error resolving Archive service file IDs:', error);
            throw error;
        }
    }

    async getOrCreateSprintFolder(sprintName) {
        try {
            // Check if sprint folder already exists
            const sprintFolderName = `Sprint_${sprintName}`;
            
            try {
                const existingFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${this.archivesFolderId}/children`)
                    .filter(`name eq '${sprintFolderName}'`)
                    .get();
                
                if (existingFolder.value && existingFolder.value.length > 0) {
                    console.log(`Sprint folder ${sprintFolderName} already exists`);
                    return existingFolder.value[0].id;
                }
            } catch (error) {
                console.log('Error checking for existing sprint folder:', error);
            }

            // Create new sprint folder
            const newFolder = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${this.archivesFolderId}/children`)
                .post({
                    name: sprintFolderName,
                    folder: {},
                    '@microsoft.graph.conflictBehavior': 'rename'
                });

            console.log(`Created new sprint folder: ${sprintFolderName}`);
            return newFolder.id;
        } catch (error) {
            console.error(`Error creating sprint folder for ${sprintName}:`, error);
            throw error;
        }
    }

    async copyFileToArchive(fileId, fileName, sprintFolderId) {
        try {
            console.log(`Copying file ${fileName} to archive...`);
            
            // Check if file already exists in the sprint folder
            try {
                const existingFiles = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/items/${sprintFolderId}/children`)
                    .filter(`name eq '${fileName}'`)
                    .get();
                
                if (existingFiles.value && existingFiles.value.length > 0) {
                    console.log(`File ${fileName} already exists in sprint folder - skipping copy`);
                    return {
                        copyInitiated: false,
                        alreadyExists: true,
                        originalFileId: fileId,
                        fileName: fileName,
                        sprintFolderId: sprintFolderId,
                        existingFileId: existingFiles.value[0].id
                    };
                }
            } catch (checkError) {
                console.log('Could not check for existing files, proceeding with copy...');
            }
            
            // Get the original file to copy
            const originalFile = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}`)
                .get();

            // Create a copy in the sprint folder with conflict behavior
            const copyRequest = {
                parentReference: {
                    id: sprintFolderId
                },
                name: fileName,
                '@microsoft.graph.conflictBehavior': 'rename'
            };

            const copyResponse = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}/copy`)
                .post(copyRequest);

            console.log(`File ${fileName} copy initiated with conflict resolution`);
            
            return {
                copyInitiated: true,
                originalFileId: fileId,
                fileName: fileName,
                sprintFolderId: sprintFolderId
            };
        } catch (error) {
            console.error(`Error copying file ${fileName}:`, error);
            throw error;
        }
    }

    async getNewFileUrl(fileName, sprintFolderId, maxRetries = 10) {
        try {
            console.log(`Getting new URL for ${fileName}...`);
            
            // Wait for the file copy to complete with retries
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Look for the copied file in the sprint folder
                    const files = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${sprintFolderId}/children`)
                        .filter(`name eq '${fileName}'`)
                        .get();

                    if (files.value && files.value.length > 0) {
                        const copiedFile = files.value[0];
                        console.log(`✅ Found copied file ${fileName} after ${attempt} attempt(s)`);
                        
                        // Return the SharePoint web URL that will open the file directly
                        return copiedFile.webUrl;
                    } else {
                        // File not found yet, wait and retry
                        console.log(`Attempt ${attempt}/${maxRetries}: File ${fileName} not found yet, waiting...`);
                        if (attempt < maxRetries) {
                            await this.delay(2000); // Wait 2 seconds between attempts
                        }
                    }
                } catch (searchError) {
                    console.error(`Error searching for file on attempt ${attempt}:`, searchError.message);
                    if (attempt < maxRetries) {
                        await this.delay(2000);
                    }
                }
            }
            
            // If we get here, the file wasn't found after all retries
            console.log(`⚠️ File ${fileName} not found after ${maxRetries} attempts`);
            
            // Return a constructed URL as fallback (though it might not work)
            const sprintFolder = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${sprintFolderId}`)
                .get();
            
            // Construct expected URL based on the sprint folder path
            const baseUrl = sprintFolder.webUrl;
            return `${baseUrl}/${fileName}`;
            
        } catch (error) {
            console.error(`Error getting new file URL for ${fileName}:`, error);
            return `[Error getting archive URL for ${fileName}]`;
        }
    }

    async addRowsToArchiveSheet(rows, sourceTableName) {
        try {
            if (!this.archiveFileId) {
                throw new Error('Archive Excel file not found. Please ensure the Content Review Sheet Archive.xlsx exists.');
            }

            console.log(`Adding ${rows.length} rows from ${sourceTableName} to archive sheet`);

            for (const row of rows) {
                try {
                    let rowData = [...row.values[0]]; // Original row data
                    
                    // If this is from Step1_Review (16 columns), pad it to match MCL_Review structure (22 columns)
                    if (sourceTableName === 'Step1_Review' && rowData.length === 16) {
                        console.log('Padding Step1_Review row to match MCL structure...');
                        
                        // Step1 has columns 0-15
                        // MCL has columns 0-21 (adds 6 reviewer columns at positions 13-18)
                        // We need to insert empty values for the MCL-specific columns
                        
                        // Take first 13 columns (0-12)
                        const firstPart = rowData.slice(0, 13);
                        // Take last 3 columns (13-15 from Step1, which become 19-21 in MCL)
                        const lastPart = rowData.slice(13, 16);
                        
                        // Reconstruct with MCL structure
                        rowData = [
                            ...firstPart,        // Columns 0-12
                            '',                  // 13: Medical Comment
                            'Not assessed',      // 14: Medical Risk
                            '',                  // 15: Regulatory Comment
                            'Not assessed',      // 16: Regulatory Risk
                            '',                  // 17: Legal Comment
                            'Not assessed',      // 18: Legal Risk
                            ...lastPart          // 19-21: Routed On, Last Action, Error
                        ];
                    }
                    
                    // The archive table has exactly 22 columns, same as MCL
                    // Don't add extra metadata columns - just use the padded row data
                    const archiveRow = [...rowData];

                    // All rows go to the single unified archive table
                    const archiveTableName = 'Content_Review_Archives';
                    
                    await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${this.archiveFileId}/workbook/tables/${archiveTableName}/rows`)
                        .post({
                            values: [archiveRow]
                        });
                    
                    console.log(`Added row to archive: ${row.values[0][1]}`); // File name
                } catch (error) {
                    console.error(`Error adding row to archive:`, error);
                    throw error;
                }
            }

            console.log(`Successfully added all rows to archive sheet`);
        } catch (error) {
            console.error('Error adding rows to archive sheet:', error);
            throw error;
        }
    }

    async deleteRowsFromTable(excelService, tableName, rowsToDelete) {
        try {
            console.log(`Deleting ${rowsToDelete.length} rows from ${tableName}`);

            // Sort rows by index in descending order to delete from bottom up
            const sortedRows = rowsToDelete.sort((a, b) => b.index - a.index);

            for (const row of sortedRows) {
                try {
                    const fileId = tableName === 'Step1_Review' ? excelService.step1FileId : excelService.mrlFileId;
                    
                    await excelService.graphClient
                        .api(`/sites/${excelService.siteId}/drive/items/${fileId}/workbook/tables/${tableName}/rows/itemAt(index=${row.index})`)
                        .delete();
                    
                    console.log(`Deleted row ${row.index} from ${tableName}`);
                } catch (error) {
                    console.error(`Error deleting row ${row.index} from ${tableName}:`, error);
                    // Continue with other deletions even if one fails
                }
            }

            console.log(`Completed deletion of rows from ${tableName}`);
        } catch (error) {
            console.error(`Error in deleteRowsFromTable:`, error);
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ArchiveService;