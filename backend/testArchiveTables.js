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

async function testArchiveTables() {
    console.log('🔍 Checking tables in Archive Excel\n');
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
        
        const archiveExcelPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives/Content Review sheet Archives.xlsx';
        
        const archiveFile = await graphClient
            .api(`/sites/${site.id}/drive/root:${archiveExcelPath}`)
            .get();
        
        console.log('Archive Excel File ID:', archiveFile.id);
        console.log('\nGetting tables from the archive Excel...\n');
        
        // Get all tables
        const tables = await graphClient
            .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables`)
            .get();
        
        console.log(`Found ${tables.value.length} table(s):\n`);
        
        for (const table of tables.value) {
            console.log(`Table Name: "${table.name}"`);
            console.log(`Table ID: ${table.id}`);
            console.log(`Show Headers: ${table.showHeaders}`);
            console.log(`Show Totals: ${table.showTotals}`);
            
            // Get columns for this table
            try {
                const columns = await graphClient
                    .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables/${table.name}/columns`)
                    .get();
                
                console.log(`Columns (${columns.value.length}):`);
                columns.value.forEach((col, index) => {
                    console.log(`   ${index}: ${col.name}`);
                });
            } catch (colError) {
                console.log('Could not get columns:', colError.message);
            }
            
            // Get row count
            try {
                const rows = await graphClient
                    .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables/${table.name}/rows`)
                    .get();
                
                console.log(`Row count: ${rows.value.length}`);
            } catch (rowError) {
                console.log('Could not get rows:', rowError.message);
            }
            
            console.log('\n---\n');
        }
        
        console.log('\n🔍 Testing if we can add rows to existing table...\n');
        
        // Try to add a test row to MRL_Review table
        try {
            const testRow = [
                'TEST_ID',
                'Test File Name',
                'https://test.url',
                'Test Purpose',
                'Test Audience',
                'Test Descriptive Name',
                '2025-09-12',
                'V1',
                'Test User',
                new Date().toISOString(),
                'Normal',
                'Test Status',
                'Test Comment',
                '', '', '', '', '', '',
                new Date().toISOString(),
                'Test Action',
                ''
            ];
            
            console.log('Attempting to add test row to MRL_Review table...');
            
            const result = await graphClient
                .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables/MRL_Review/rows`)
                .post({
                    values: [testRow]
                });
            
            console.log('✅ Successfully added test row!');
            console.log('This confirms the table is accessible and writable.\n');
            
        } catch (addError) {
            console.log('❌ Could not add test row:', addError.message);
            console.log('Error code:', addError.code);
            console.log('\n');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testArchiveTables().then(() => {
    console.log('✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});