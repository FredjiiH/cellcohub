const GraphClientService = require('./graphClient');

class SharePointService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = null; // Will be initialized when access token is set
        
        this.siteId = null;
        this.driveId = null;
        this.readyToReviewFolderId = null;
        this.finalOrgFolderId = null;
    }

    async initialize() {
        try {
            // Resolve site ID
            const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
            const site = await this.graphClient.api(`/sites/${siteUrl}`).get();
            this.siteId = site.id;

            // Get drive
            const drive = await this.graphClient.api(`/sites/${this.siteId}/drive`).get();
            this.driveId = drive.id;

            // Resolve folder IDs
            await this.resolveFolderIds();
            
            console.log('SharePoint service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize SharePoint service:', error);
            throw error;
        }
    }

    async resolveFolderIds() {
        try {
            // Ready to Review folder
            const readyToReviewPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Ready to Review';
            const readyFolder = await this.graphClient
                .api(`/sites/${this.siteId}/drive/root:${readyToReviewPath}`)
                .get();
            this.readyToReviewFolderId = readyFolder.id;

            // Final organization folder (create if doesn't exist)
            const finalOrgPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Final organization';
            try {
                const finalFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${finalOrgPath}`)
                    .get();
                this.finalOrgFolderId = finalFolder.id;
            } catch (error) {
                if (error.code === 'itemNotFound') {
                    console.log('Final organization folder not found, creating...');
                    const parentPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval';
                    const parentFolder = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/root:${parentPath}`)
                        .get();
                    
                    const newFolder = await this.graphClient
                        .api(`/sites/${this.siteId}/drive/items/${parentFolder.id}/children`)
                        .post({
                            name: 'Final organization',
                            folder: {},
                            '@microsoft.graph.conflictBehavior': 'rename'
                        });
                    
                    this.finalOrgFolderId = newFolder.id;
                    console.log('Created Final organization folder');
                } else {
                    throw error;
                }
            }

            console.log('Folder IDs resolved:', {
                readyToReview: this.readyToReviewFolderId,
                finalOrg: this.finalOrgFolderId
            });
        } catch (error) {
            console.error('Error resolving folder IDs:', error);
            throw error;
        }
    }

    async getFilesInReadyToReview() {
        try {
            const response = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${this.readyToReviewFolderId}/children`)
                .get();

            // Filter to only return files (not folders) client-side
            const allItems = response.value || [];
            return allItems.filter(item => item.file && !item.folder);
        } catch (error) {
            console.error('Error getting files from Ready to Review folder:', error);
            throw error;
        }
    }

    async moveFileToFinalOrg(fileId, fileName) {
        try {
            // Move file to Final organization folder
            const moveResponse = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}`)
                .patch({
                    parentReference: {
                        id: this.finalOrgFolderId
                    },
                    name: fileName // Keep original name or could modify if needed
                });

            console.log(`Successfully moved file ${fileName} to Final organization`);
            return moveResponse;
        } catch (error) {
            console.error(`Error moving file ${fileName}:`, error);
            throw error;
        }
    }

    parseFileName(fileName) {
        try {
            // Remove file extension
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
            
            // Parse pattern: "{Purpose} - {DescriptiveName} - {yyyymmdd} - {Version}"
            const pattern = /^(.+?) - (.+?) - (\d{8}) - (.+?)$/;
            const match = nameWithoutExt.match(pattern);

            if (!match) {
                throw new Error(`Filename does not match expected pattern: ${fileName}`);
            }

            const [, purpose, descriptiveName, dateStr, version] = match;
            
            // Convert yyyymmdd to ISO date
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const versionDate = new Date(`${year}-${month}-${day}`);

            if (isNaN(versionDate.getTime())) {
                throw new Error(`Invalid date in filename: ${dateStr}`);
            }

            // Extract target audience from purpose if it follows pattern "Type - Audience"
            let extractedPurpose = purpose.trim();
            let targetAudience = '';
            
            const purposeParts = purpose.trim().split(' - ');
            if (purposeParts.length >= 2) {
                extractedPurpose = purposeParts[0].trim();
                targetAudience = purposeParts[1].trim();
            }

            return {
                purpose: extractedPurpose,
                targetAudience: targetAudience,
                descriptiveName: descriptiveName.trim(),
                versionDate: versionDate.toISOString().split('T')[0], // yyyy-MM-dd format
                version: version.trim(),
                fileName: nameWithoutExt
            };
        } catch (error) {
            console.error(`Error parsing filename ${fileName}:`, error);
            throw error;
        }
    }

    async getFileMetadata(fileId) {
        try {
            const file = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}`)
                .select('id,name,webUrl,createdDateTime,createdBy,size')
                .get();

            return {
                fileId: file.id,
                fileName: file.name,
                fileUrl: file.webUrl,
                created: file.createdDateTime,
                uploader: file.createdBy?.user?.displayName || 'Unknown',
                size: file.size
            };
        } catch (error) {
            console.error(`Error getting file metadata for ${fileId}:`, error);
            throw error;
        }
    }

    createStep1RowData(fileMetadata, parsedName) {
        const now = new Date().toISOString();
        
        return [
            fileMetadata.fileId,                    // 1. FileID (system)
            parsedName.fileName,                    // 2. File Name
            fileMetadata.fileUrl,                   // 3. File URL
            parsedName.targetAudience || '',        // 4. Target audience
            parsedName.purpose,                     // 5. Purpose
            parsedName.descriptiveName,             // 6. Descriptive Name
            parsedName.versionDate,                 // 7. Version Date
            parsedName.version,                     // 8. Version
            fileMetadata.uploader,                  // 9. Uploader
            fileMetadata.created,                   // 10. Created
            'Normal',                               // 11. Priority
            'Pending Micke Review',                 // 12. Status
            '',                                     // 13. Michael Comments
            '',                                     // 14. Routed On (system)
            'Intake row created',                   // 15. Last Action (system)
            ''                                      // 16. Error (system)
        ];
    }

    async checkFileExists(fileId) {
        try {
            await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${fileId}`)
                .get();
            return true;
        } catch (error) {
            if (error.code === 'itemNotFound') {
                return false;
            }
            throw error;
        }
    }
}

module.exports = SharePointService;