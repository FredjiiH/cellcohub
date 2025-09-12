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

async function testArchiveExcelInFolder() {
    console.log('🔍 Looking for Archive Excel file in Archives folder\n');
    console.log('=====================================\n');
    
    const accessToken = process.env.TEST_ACCESS_TOKEN;
    
    if (!accessToken || accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
        console.log('❌ Please set TEST_ACCESS_TOKEN in your .env file');
        return;
    }
    
    const graphClient = getGraphClient(accessToken);
    
    try {
        const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
        const site = await graphClient.api(`/sites/${siteUrl}`).get();
        
        // Check inside Archives folder for the Excel file
        const archivesFolderId = '01M2FZ47OSWRHLTFGH3JEKTSN3CKLDAXCF';
        
        console.log('Checking inside Archives folder for Excel files...\n');
        const children = await graphClient
            .api(`/sites/${site.id}/drive/items/${archivesFolderId}/children`)
            .get();
        
        console.log(`Found ${children.value.length} items in Archives folder:\n`);
        
        children.value.forEach(item => {
            const type = item.folder ? '📁 Folder' : '📄 File';
            console.log(`   ${type}: ${item.name}`);
            
            if (item.file && item.name.endsWith('.xlsx')) {
                console.log(`      ^ This is an Excel file! ID: ${item.id}`);
            }
        });
        
        // Also check the "Archieves" folder (misspelled)
        console.log('\n\nChecking the "Archieves" folder (misspelled)...\n');
        try {
            const misspelledPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archieves';
            const misspelledFolder = await graphClient
                .api(`/sites/${site.id}/drive/root:${misspelledPath}`)
                .get();
            
            const misspelledContents = await graphClient
                .api(`/sites/${site.id}/drive/items/${misspelledFolder.id}/children`)
                .get();
            
            console.log(`Found ${misspelledContents.value.length} items in "Archieves" folder:\n`);
            
            misspelledContents.value.forEach(item => {
                const type = item.folder ? '📁 Folder' : '📄 File';
                console.log(`   ${type}: ${item.name}`);
                
                if (item.file && item.name.toLowerCase().includes('archive') && item.name.endsWith('.xlsx')) {
                    console.log(`      ^ This looks like the Archive Excel file! ID: ${item.id}`);
                    console.log(`      Full path would be: ${misspelledPath}/${item.name}`);
                }
            });
        } catch (err) {
            console.log('Could not access "Archieves" folder');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testArchiveExcelInFolder().then(() => {
    console.log('\n✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});