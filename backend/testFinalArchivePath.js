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

async function testFinalArchivePath() {
    console.log('✅ Final verification of Archive paths\n');
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
        
        // The exact path we'll use in the service
        const archiveExcelPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives/Content Review sheet Archives.xlsx';
        
        console.log('Testing the exact path that will be used:\n');
        console.log(`Path: ${archiveExcelPath}\n`);
        
        try {
            const archiveFile = await graphClient
                .api(`/sites/${site.id}/drive/root:${archiveExcelPath}`)
                .get();
            
            console.log('✅✅✅ SUCCESS! Archive Excel file is accessible! ✅✅✅\n');
            console.log('File details:');
            console.log(`   Name: ${archiveFile.name}`);
            console.log(`   ID: ${archiveFile.id}`);
            console.log(`   Size: ${archiveFile.size} bytes`);
            console.log(`   Web URL: ${archiveFile.webUrl}\n`);
            
            // Get tables
            const tables = await graphClient
                .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables`)
                .get();
            
            console.log(`Tables in the Archive Excel (${tables.value.length} found):`);
            tables.value.forEach(table => {
                console.log(`   - ${table.name}`);
            });
            
            console.log('\n🎉 Archive functionality should now work correctly!');
            
        } catch (error) {
            console.log('❌ FAILED to access Archive Excel file');
            console.log(`Error: ${error.message}`);
            console.log('\n⚠️ Archive functionality will NOT work until this is fixed!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testFinalArchivePath().then(() => {
    console.log('\n✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});