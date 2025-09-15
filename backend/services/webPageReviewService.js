const GraphClientService = require('./graphClient');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { Document, Packer, Paragraph, TextRun } = require('docx');
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

            console.log('Raw spreadsheet data:', JSON.stringify(rows.value, null, 2));
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
                try {
                    const rawText = $(elem).text();
                    const text = rawText ? String(rawText).trim() : '';
                    if (text) {
                        content.headings.push({
                            level: elem.name,
                            text: text
                        });
                    }
                } catch (e) {
                    console.error(`Error extracting heading text: ${e.message}`);
                }
            });
            
            // Get paragraphs
            $('p').each((i, elem) => {
                try {
                    const rawText = $(elem).text();
                    const text = rawText ? String(rawText).trim() : '';
                    if (text && text.length > 20) { // Filter out very short paragraphs
                        content.paragraphs.push(text);
                    }
                } catch (e) {
                    console.error(`Error extracting paragraph text: ${e.message}`);
                }
            });
            
            // Get lists
            $('ul, ol').each((i, elem) => {
                const items = [];
                $(elem).find('li').each((j, li) => {
                    try {
                        const rawText = $(li).text();
                        const text = rawText ? String(rawText).trim() : '';
                        if (text) {
                            items.push(text);
                        }
                    } catch (e) {
                        console.error(`Error extracting list item text: ${e.message}`);
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
            // Columns: URL, Purpose, Descriptive Name, Target Audience, Date, Version, Context (updated structure)
            const rowData = pageData.values[0];
            console.log('Row data for document creation:', rowData);
            
            const [url, purpose, descriptiveName, targetAudience, date, version, context] = rowData;
            
            // Convert values to strings and handle missing data
            const safeUrl = url ? String(url).trim() : 'No URL provided';
            const safePurpose = purpose ? String(purpose).trim() : 'No Purpose';
            const safeDescriptiveName = descriptiveName ? String(descriptiveName).trim() : 'No Name';
            const safeTargetAudience = targetAudience ? String(targetAudience).trim() : 'No Audience';
            const safeVersion = version ? String(version).trim() : 'V1';
            const safeContext = context ? String(context).trim() : '';
            
            // Handle date formatting - Excel serial date conversion
            let formattedDate = '20250915'; // fallback
            let readableDate = 'No date provided';
            
            if (date) {
                console.log('Processing date:', date, 'Type:', typeof date);
                try {
                    let dateObj;
                    if (typeof date === 'number') {
                        // Excel serial date - convert to JavaScript Date
                        // Excel epoch starts at 1900-01-01, but has a leap year bug (day 60 = Feb 29, 1900)
                        // JavaScript Date epoch starts at 1970-01-01
                        // Formula: (excel_date - 25569) * 86400 * 1000
                        dateObj = new Date((date - 25569) * 86400 * 1000);
                        console.log('Converted Excel serial date to:', dateObj);
                    } else if (date instanceof Date) {
                        dateObj = date;
                    } else {
                        dateObj = new Date(String(date));
                    }
                    
                    if (!isNaN(dateObj.getTime())) {
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        formattedDate = `${year}${month}${day}`;
                        readableDate = `${year}-${month}-${day}`;
                        console.log('Final formatted date:', formattedDate, 'Readable:', readableDate);
                    }
                } catch (e) {
                    console.log('Date formatting error, using fallback:', e.message);
                }
            }
            
            const fileName = `${safePurpose} - ${safeTargetAudience} - ${safeDescriptiveName} - ${formattedDate} - ${safeVersion}.docx`;
            
            console.log(`Creating Word document: ${fileName}`);
            
            // Create document content
            const paragraphs = [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Web Page Review Document",
                            bold: true,
                            size: 28
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "URL to Review:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safeUrl}`,
                            break: 1
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Purpose:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safePurpose}`,
                            break: 1
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Target Audience:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safeTargetAudience}`,
                            break: 1
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Descriptive Name:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safeDescriptiveName}`,
                            break: 1
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Version:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safeVersion}`,
                            break: 1
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Date:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${readableDate}`,
                            break: 1
                        })
                    ]
                })
            ];
            
            // Add Context field if available
            if (safeContext) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: "Context:",
                            bold: true
                        }),
                        new TextRun({
                            text: ` ${safeContext}`,
                            break: 1
                        })
                    ]
                }));
            }
            
            // Add Content Summary section
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({
                        text: "Content Summary:",
                        bold: true,
                        break: 2
                    })
                ]
            }));
            
            // Add scraped content if available
            if (scrapedContent) {
                if (scrapedContent.title && scrapedContent.title !== 'No title') {
                    paragraphs.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: "Page Title:",
                                bold: true
                            }),
                            new TextRun({
                                text: ` ${scrapedContent.title}`,
                                break: 1
                            })
                        ]
                    }));
                }
                
                if (scrapedContent.headings && scrapedContent.headings.length > 0) {
                    paragraphs.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: "Headings:",
                                bold: true,
                                break: 1
                            })
                        ]
                    }));
                    
                    scrapedContent.headings.forEach(heading => {
                        paragraphs.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: `${heading.level.toUpperCase()}: ${heading.text}`
                                })
                            ]
                        }));
                    });
                }
                
                if (scrapedContent.paragraphs && scrapedContent.paragraphs.length > 0) {
                    paragraphs.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: "Content:",
                                bold: true,
                                break: 1
                            })
                        ]
                    }));
                    
                    scrapedContent.paragraphs.slice(0, 5).forEach(para => {
                        paragraphs.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: para
                                })
                            ]
                        }));
                    });
                }
            } else {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: "Content will be scraped and added in a future update. Please manually review the content at the URL above."
                        })
                    ]
                }));
            }
            
            // Create the document
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: paragraphs
                }]
            });
            
            // Generate document buffer
            const buffer = await Packer.toBuffer(doc);
            
            // Write to temporary file
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, fileName);
            await fs.writeFile(tempFilePath, buffer);
            
            console.log(`Word document created: ${tempFilePath}`);
            return { filePath: tempFilePath, fileName: fileName };
            
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
                    
                    // Scrape web page content
                    const scrapedContent = await this.scrapeWebPage(url);
                    
                    // Create Word document with scraped content
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