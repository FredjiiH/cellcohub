require('dotenv').config();
const WebPageReviewService = require('./services/webPageReviewService');

async function debugWebPageProcessing() {
    console.log('🔍 Debug: Testing web page processing\n');
    
    const accessToken = process.env.TEST_ACCESS_TOKEN;
    
    YOUR_ACCESS_TOKEN_HERE') {
        console.log('❌ Please set TEST_ACCESS_TOKEN in your .env file');
        return;
    }
    
    try {
        const service = new WebPageReviewService();
        service.graphClientService.setAccessToken(accessToken);
        service.graphClient = service.graphClientService.getClient();
        
        await service.initialize();
        
        // Get the web pages
        const webPages = await service.getWebPagesToReview();
        console.log(`Found ${webPages.length} web pages to process`);
        
        if (webPages.length > 0) {
            const firstPage = webPages[0];
            console.log('\n📊 First row data structure:');
            console.log('Row values:', firstPage.values[0]);
            console.log('Data types:');
            firstPage.values[0].forEach((val, idx) => {
                console.log(`  Column ${idx}: ${typeof val} = "${val}"`);
            });
            
            // Test processing just the first page
            console.log('\n🧪 Testing first page processing...');
            
            const pageData = firstPage;
            const rawUrl = pageData.values[0][0];
            console.log(`Raw URL type: ${typeof rawUrl}, value: "${rawUrl}"`);
            
            const url = rawUrl ? String(rawUrl).trim() : '';
            console.log(`Converted URL type: ${typeof url}, value: "${url}"`);
            
            // Test scraping
            console.log('\n🌐 Testing web scraping...');
            try {
                const scrapedContent = await service.scrapeWebPage(url);
                console.log('Scraping successful!');
                console.log('Content structure:', {
                    title: typeof scrapedContent.title,
                    headings: scrapedContent.headings.length,
                    paragraphs: scrapedContent.paragraphs.length,
                    lists: scrapedContent.lists.length
                });
            } catch (scrapeError) {
                console.error('Scraping failed:', scrapeError.message);
                console.error('Stack trace:', scrapeError.stack);
            }
            
            // Test document creation
            console.log('\n📄 Testing document creation...');
            try {
                // Test just the data extraction part
                const [testUrl, purpose, descriptiveName, targetAudience, date, version] = pageData.values[0];
                
                console.log('Extracted values:');
                console.log(`  URL: ${typeof testUrl} = "${testUrl}"`);
                console.log(`  Purpose: ${typeof purpose} = "${purpose}"`);
                console.log(`  Descriptive Name: ${typeof descriptiveName} = "${descriptiveName}"`);
                console.log(`  Target Audience: ${typeof targetAudience} = "${targetAudience}"`);
                console.log(`  Date: ${typeof date} = "${date}"`);
                console.log(`  Version: ${typeof version} = "${version}"`);
                
                // Test string conversion
                console.log('\nTesting string conversions:');
                const safePurpose = purpose ? String(purpose) : 'Unknown';
                console.log(`  Safe Purpose: ${typeof safePurpose} = "${safePurpose}"`);
                
                // Test date handling
                console.log('\nTesting date handling:');
                console.log(`  Date value: ${date}`);
                console.log(`  Date type: ${typeof date}`);
                console.log(`  Date is Date object: ${date instanceof Date}`);
                
                if (date) {
                    if (typeof date === 'string') {
                        console.log('  Date is string, trying replace...');
                        try {
                            const result = date.replace(/\//g, '');
                            console.log(`  Replace successful: "${result}"`);
                        } catch (e) {
                            console.log(`  Replace failed: ${e.message}`);
                        }
                    }
                }
                
            } catch (docError) {
                console.error('Document creation test failed:', docError.message);
                console.error('Stack trace:', docError.stack);
            }
        }
        
    } catch (error) {
        console.error('❌ Debug test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the debug test
debugWebPageProcessing().then(() => {
    console.log('\n✅ Debug test complete');
}).catch(err => {
    console.error('❌ Debug test failed:', err);
});