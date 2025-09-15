const GraphClientService = require('./graphClient');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const officegen = require('officegen');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class WebPageReviewService {
    constructor() {
        this.graphClientService = new GraphClientService();
        this.graphClient = null;
        this.siteId = null;
        this.driveId = null;
        this.webPagesFileId = null;
        this.filesReadyToReviewFolderId = null;
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
            await this.resolveIds();
            
            console.log('Web page review service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize web page review service:', error);
            throw error;
        }
    }

    async resolveIds() {
        try {
            // Path to Web pages Ready to Review spreadsheet
            const webPagesPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Ready to Review/Web pages Ready to Review.xlsx';
            try {
                const webPagesFile = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${webPagesPath}`)
                    .get();
                this.webPagesFileId = webPagesFile.id;
                console.log('Found Web pages Ready to Review spreadsheet');
            } catch (error) {
                console.log('Web pages Ready to Review spreadsheet not found:', error.message);
                throw new Error('Web pages Ready to Review.xlsx not found at expected location');
            }

            // Path to Files Ready to Review folder
            const filesReadyPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Ready to Review/Files Ready to Review';
            try {
                const filesReadyFolder = await this.graphClient
                    .api(`/sites/${this.siteId}/drive/root:${filesReadyPath}`)
                    .get();
                this.filesReadyToReviewFolderId = filesReadyFolder.id;
                console.log('Found Files Ready to Review folder');
            } catch (error) {
                console.log('Files Ready to Review folder not found:', error.message);
                throw new Error('Files Ready to Review folder not found');
            }

        } catch (error) {
            console.error('Error resolving IDs:', error);
            throw error;
        }
    }

    async getWebPagesToReview() {
        try {
            // Get all rows from the Web pages spreadsheet
            // Use the specific table named "Web_pages"
            const tableName = 'Web_pages';
            console.log(`Using table: ${tableName}`);

            const rows = await this.graphClient
                .api(`/sites/${this.siteId}/drive/items/${this.webPagesFileId}/workbook/tables/${tableName}/rows`)
                .get();

            return rows.value || [];
        } catch (error) {
            console.error('Error getting web pages to review:', error);
            throw error;
        }
    }

    async scrapeWebPage(url) {
        try {
            console.log(`Scraping content from: ${url}`);
            
            const response = await fetch(url);
            const html = await response.text();
            
            // Use cheerio to parse HTML
            const $ = cheerio.load(html);
            
            // Remove script and style elements
            $('script').remove();
            $('style').remove();
            
            // Extract text content, focusing on main content areas
            const content = {
                title: $('title').text() || 'No title',
                headings: [],
                paragraphs: [],
                lists: []
            };
            
            // Get all headings
            $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
                const rawText = $(elem).text();
                const text = rawText ? String(rawText).trim() : '';
                if (text) {
                    content.headings.push({
                        level: elem.name,
                        text: text
                    });
                }
            });
            
            // Get paragraphs
            $('p').each((i, elem) => {
                const rawText = $(elem).text();
                const text = rawText ? String(rawText).trim() : '';
                if (text && text.length > 20) { // Filter out very short paragraphs
                    content.paragraphs.push(text);
                }
            });
            
            // Get lists
            $('ul, ol').each((i, elem) => {
                const items = [];
                $(elem).find('li').each((j, li) => {
                    const rawText = $(li).text();
                    const text = rawText ? String(rawText).trim() : '';
                    if (text) {
                        items.push(text);
                    }
                });
                if (items.length > 0) {
                    content.lists.push({
                        type: elem.name,
                        items: items
                    });
                }
            });
            
            return content;
        } catch (error) {
            console.error(`Error scraping web page ${url}:`, error);
            return {
                title: 'Error scraping page',
                error: error.message,
                headings: [],
                paragraphs: [`Failed to scrape content from ${url}: ${error.message}`],
                lists: []
            };
        }
    }

    async createWordDocument(pageData, scrapedContent) {
        try {
            // Extract data from the row
            // Columns: URL, Purpose, Descriptive Name, Target Audience, Date, Version
            const [url, purpose, descriptiveName, targetAudience, date, version] = pageData.values[0];
            
            // Ensure all text fields are strings
            const safeUrl = url ? String(url) : '';
            const safePurpose = purpose ? String(purpose) : 'Unknown';
            const safeDescriptiveName = descriptiveName ? String(descriptiveName) : 'Unknown';
            const safeTargetAudience = targetAudience ? String(targetAudience) : 'Unknown';
            const safeVersion = version ? String(version) : 'V1';
            
            // Handle date formatting - Excel might return Date object, number, or string
            let formattedDate;
            if (date) {
                if (typeof date === 'string') {
                    // If it's already a string, just remove slashes
                    formattedDate = date.replace(/\//g, '').replace(/-/g, '');
                } else if (date instanceof Date) {
                    // If it's a Date object, format it
                    formattedDate = date.toISOString().slice(0, 10).replace(/-/g, '');
                } else if (typeof date === 'number') {
                    // If it's an Excel serial date number, convert it
                    const excelDate = new Date((date - 25569) * 86400 * 1000); // Excel epoch is 1900-01-01
                    formattedDate = excelDate.toISOString().slice(0, 10).replace(/-/g, '');
                } else {
                    // Fallback to current date
                    formattedDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                }
            } else {
                // No date provided, use current date
                formattedDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            }
            
            const fileName = `${safePurpose} - ${safeTargetAudience} - ${safeDescriptiveName} - ${formattedDate} - ${safeVersion}.docx`;
            
            console.log(`Creating Word document: ${fileName}`);
            
            // Create a new Word document
            const docx = officegen('docx');
            
            // Add document properties
            docx.setDocSubject('Web Page Review');
            docx.setDocKeywords(['review', 'web page', safePurpose, safeTargetAudience]);
            
            // Add header with URL
            let pObj = docx.createP();
            pObj.addText('Web Page Review Document', { bold: true, font_size: 16 });
            
            pObj = docx.createP();
            pObj.addText('URL: ', { bold: true });
            pObj.addText(safeUrl, { color: '0000FF', underline: true });
            
            // Add metadata
            pObj = docx.createP();
            pObj.addText('Purpose: ', { bold: true });
            pObj.addText(safePurpose);
            
            pObj = docx.createP();
            pObj.addText('Target Audience: ', { bold: true });
            pObj.addText(safeTargetAudience);
            
            pObj = docx.createP();
            pObj.addText('Descriptive Name: ', { bold: true });
            pObj.addText(safeDescriptiveName);
            
            pObj = docx.createP();
            pObj.addText('Date: ', { bold: true });
            // Format date for display
            let displayDate = 'Not specified';
            if (date) {
                if (typeof date === 'string') {
                    displayDate = date;
                } else if (date instanceof Date) {
                    displayDate = date.toLocaleDateString();
                } else if (typeof date === 'number') {
                    const excelDate = new Date((date - 25569) * 86400 * 1000);
                    displayDate = excelDate.toLocaleDateString();
                }
            }
            pObj.addText(displayDate);
            
            pObj = docx.createP();
            pObj.addText('Version: ', { bold: true });
            pObj.addText(safeVersion);
            
            // Add separator
            pObj = docx.createP();
            pObj.addText('________________________________________', { color: '808080' });
            
            // Add scraped content
            pObj = docx.createP();
            pObj.addText('Page Content:', { bold: true, font_size: 14 });
            
            // Add title
            if (scrapedContent.title) {
                pObj = docx.createP();
                pObj.addText(`Page Title: ${scrapedContent.title}`, { italic: true });
            }
            
            // Add error if scraping failed
            if (scrapedContent.error) {
                pObj = docx.createP();
                pObj.addText(`Error: ${scrapedContent.error}`, { color: 'FF0000' });
            }
            
            // Add headings and their associated content
            scrapedContent.headings.forEach((heading, index) => {
                pObj = docx.createP();
                const fontSize = heading.level === 'h1' ? 14 : heading.level === 'h2' ? 13 : 12;
                pObj.addText(heading.text, { bold: true, font_size: fontSize });
                
                // Add relevant paragraphs after each heading (simplified approach)
                if (index < scrapedContent.paragraphs.length) {
                    pObj = docx.createP();
                    pObj.addText(scrapedContent.paragraphs[index]);
                }
            });
            
            // Add remaining paragraphs if headings are fewer
            for (let i = scrapedContent.headings.length; i < scrapedContent.paragraphs.length; i++) {
                pObj = docx.createP();
                pObj.addText(scrapedContent.paragraphs[i]);
            }
            
            // Add lists
            scrapedContent.lists.forEach(list => {
                list.items.forEach(item => {
                    pObj = docx.createP();
                    pObj.addText(`• ${item}`);
                });
            });
            
            // Generate the document to a temporary file
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, fileName);
            
            return new Promise((resolve, reject) => {
                const out = require('fs').createWriteStream(tempFilePath);
                
                out.on('error', reject);
                
                docx.on('finalize', async () => {
                    console.log(`Word document created: ${tempFilePath}`);
                    resolve({ filePath: tempFilePath, fileName: fileName });
                });
                
                docx.on('error', reject);
                
                docx.generate(out);
            });
        } catch (error) {
            console.error('Error creating Word document:', error);
            throw error;
        }
    }

    async uploadToSharePoint(filePath, fileName) {
        try {
            console.log(`Uploading ${fileName} to SharePoint...`);
            
            // Read the file
            const fileContent = await fs.readFile(filePath);
            
            // Upload to Files Ready to Review folder
            const uploadUrl = `/sites/${this.siteId}/drive/items/${this.filesReadyToReviewFolderId}:/${fileName}:/content`;
            
            const uploadedFile = await this.graphClient
                .api(uploadUrl)
                .put(fileContent);
            
            console.log(`Successfully uploaded ${fileName} to SharePoint`);
            
            // Clean up temp file
            await fs.unlink(filePath);
            
            return uploadedFile;
        } catch (error) {
            console.error(`Error uploading file to SharePoint:`, error);
            throw error;
        }
    }

    async processWebPages() {
        try {
            console.log('Starting web page review processing...');
            
            // Get all web pages to review
            const webPages = await this.getWebPagesToReview();
            console.log(`Found ${webPages.length} web pages to process`);
            
            const results = {
                processed: 0,
                errors: [],
                files: []
            };
            
            for (const pageData of webPages) {
                // Define url outside try block so it's accessible in catch
                let url = 'Unknown URL';
                
                try {
                    const rawUrl = pageData.values[0][0]; // First column is URL
                    
                    // Ensure URL is a string
                    url = rawUrl ? String(rawUrl).trim() : '';
                    
                    if (!url || url === '') {
                        console.log('Skipping row with empty URL');
                        continue;
                    }
                    
                    console.log(`Processing: ${url}`);
                    
                    // Scrape the web page
                    const scrapedContent = await this.scrapeWebPage(url);
                    
                    // Create Word document
                    const { filePath, fileName } = await this.createWordDocument(pageData, scrapedContent);
                    
                    // Upload to SharePoint
                    const uploadedFile = await this.uploadToSharePoint(filePath, fileName);
                    
                    results.processed++;
                    results.files.push({
                        fileName: fileName,
                        url: url,
                        fileId: uploadedFile.id
                    });
                    
                    console.log(`Successfully processed: ${url}`);
                    
                } catch (error) {
                    console.error(`Error processing web page:`, error);
                    results.errors.push({
                        url: url,
                        error: error.message
                    });
                }
            }
            
            console.log('Web page review processing completed');
            console.log(`Processed: ${results.processed} pages`);
            console.log(`Errors: ${results.errors.length}`);
            
            return results;
            
        } catch (error) {
            console.error('Error in web page review process:', error);
            throw error;
        }
    }
}

module.exports = WebPageReviewService;