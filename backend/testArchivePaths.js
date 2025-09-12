require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

// Create Graph client
function getGraphClient(accessToken) {
    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });
}

async function testArchivePaths() {
    console.log('🔍 Testing Archive Paths\n');
    console.log('=====================================\n');
    
    // You'll need to provide a valid access token here
    // For testing, you can get one from the browser developer tools when logged in
    const accessToken = process.env.TEST_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE';
    
    if (accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
        console.log('❌ Please set TEST_ACCESS_TOKEN in your .env file');
        console.log('You can get this from browser dev tools when logged in to the app');
        return;
    }
    
    const graphClient = getGraphClient(accessToken);
    
    try {
        // Step 1: Get the site
        console.log('1️⃣ Getting SharePoint site...');
        const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
        const site = await graphClient.api(`/sites/${siteUrl}`).get();
        console.log(`✅ Site ID: ${site.id}\n`);
        
        // Step 2: Get the drive
        console.log('2️⃣ Getting document library drive...');
        const drive = await graphClient.api(`/sites/${site.id}/drive`).get();
        console.log(`✅ Drive ID: ${drive.id}\n`);
        
        // Step 3: Check the Content approval folder path (same as used in other services)
        console.log('3️⃣ Checking Content approval folder...');
        const contentApprovalPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval';
        
        try {
            const contentFolder = await graphClient
                .api(`/sites/${site.id}/drive/root:${contentApprovalPath}`)
                .get();
            console.log(`✅ Content approval folder found!`);
            console.log(`   ID: ${contentFolder.id}\n`);
            
            // Step 4: List all items in Content approval folder
            console.log('4️⃣ Listing contents of Content approval folder:');
            const children = await graphClient
                .api(`/sites/${site.id}/drive/items/${contentFolder.id}/children`)
                .get();
            
            console.log(`Found ${children.value.length} items:\n`);
            
            let archiveFolderId = null;
            let archiveExcelId = null;
            
            children.value.forEach(item => {
                const type = item.folder ? '📁 Folder' : '📄 File';
                console.log(`   ${type}: ${item.name}`);
                
                // Look for Archives folder
                if (item.folder && item.name.toLowerCase().includes('archive')) {
                    archiveFolderId = item.id;
                    console.log(`      ^ This looks like the Archives folder! ID: ${item.id}`);
                }
                
                // Look for Archive Excel file
                if (item.file && item.name.toLowerCase().includes('archive') && item.name.endsWith('.xlsx')) {
                    archiveExcelId = item.id;
                    console.log(`      ^ This looks like the Archive Excel file! ID: ${item.id}`);
                }
            });
            
            console.log('\n');
            
            // Step 5: Check specific paths for Archive Excel
            console.log('5️⃣ Testing specific Archive Excel paths:');
            const excelPaths = [
                'Content review sheet Archive.xlsx',
                'Content Review Sheet Archive.xlsx',
                'Content Review sheet Archive.xlsx'
            ];
            
            for (const fileName of excelPaths) {
                const fullPath = `${contentApprovalPath}/${fileName}`;
                try {
                    const file = await graphClient
                        .api(`/sites/${site.id}/drive/root:${fullPath}`)
                        .get();
                    console.log(`   ✅ Found at: ${fullPath}`);
                    console.log(`      File ID: ${file.id}`);
                    
                    // Try to get tables
                    try {
                        const tables = await graphClient
                            .api(`/sites/${site.id}/drive/items/${file.id}/workbook/tables`)
                            .get();
                        console.log(`      Tables: ${tables.value.map(t => t.name).join(', ')}`);
                    } catch (tableErr) {
                        console.log(`      Could not get tables: ${tableErr.message}`);
                    }
                    break;
                } catch (err) {
                    console.log(`   ❌ Not found at: ${fullPath}`);
                }
            }
            
            console.log('\n');
            
            // Step 6: Check Archives folder
            console.log('6️⃣ Testing Archives folder path:');
            const archivesFolderPath = `${contentApprovalPath}/Archives`;
            
            try {
                const archivesFolder = await graphClient
                    .api(`/sites/${site.id}/drive/root:${archivesFolderPath}`)
                    .get();
                console.log(`   ✅ Archives folder found at: ${archivesFolderPath}`);
                console.log(`      Folder ID: ${archivesFolder.id}`);
                
                // List contents
                const archiveContents = await graphClient
                    .api(`/sites/${site.id}/drive/items/${archivesFolder.id}/children`)
                    .get();
                console.log(`      Contents (${archiveContents.value.length} items):`);
                archiveContents.value.forEach(item => {
                    const type = item.folder ? '📁' : '📄';
                    console.log(`        ${type} ${item.name}`);
                });
            } catch (err) {
                console.log(`   ❌ Archives folder not found at: ${archivesFolderPath}`);
                console.log(`      Error: ${err.message}`);
            }
            
        } catch (error) {
            console.error('❌ Error accessing Content approval folder:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Error in test:', error);
        console.error('Error details:', error.message);
    }
}

// Run the test
testArchivePaths().then(() => {
    console.log('\n✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});