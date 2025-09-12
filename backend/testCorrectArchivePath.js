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

async function testCorrectArchivePath() {
    console.log('🔍 Testing corrected Archive paths\n');
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
        console.log(`✅ Connected to site: ${site.id}\n`);
        
        // Test 1: Check for the Archive Excel file with correct spelling
        console.log('1️⃣ Testing Archive Excel file with correct spelling...\n');
        const archiveExcelPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content Review sheet Archives.xlsx';
        
        try {
            const archiveFile = await graphClient
                .api(`/sites/${site.id}/drive/root:${archiveExcelPath}`)
                .get();
            
            console.log(`   ✅ Archive Excel file FOUND!`);
            console.log(`   Path: ${archiveExcelPath}`);
            console.log(`   File ID: ${archiveFile.id}`);
            console.log(`   File size: ${archiveFile.size} bytes`);
            console.log(`   Last modified: ${archiveFile.lastModifiedDateTime}\n`);
            
            // Try to get tables from the Excel file
            try {
                const tables = await graphClient
                    .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables`)
                    .get();
                
                console.log(`   📊 Tables in Archive Excel (${tables.value.length} found):`);
                tables.value.forEach(table => {
                    console.log(`      - ${table.name} (ID: ${table.id})`);
                });
            } catch (tableError) {
                console.log(`   ⚠️ Could not retrieve tables: ${tableError.message}`);
            }
        } catch (error) {
            console.log(`   ❌ Archive Excel file NOT found at: ${archiveExcelPath}`);
            console.log(`   Error: ${error.message}`);
        }
        
        console.log('\n');
        
        // Test 2: Check Archives folder (correct spelling)
        console.log('2️⃣ Testing Archives folder...\n');
        const archivesFolderPath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives';
        
        try {
            const archivesFolder = await graphClient
                .api(`/sites/${site.id}/drive/root:${archivesFolderPath}`)
                .get();
            
            console.log(`   ✅ Archives folder FOUND!`);
            console.log(`   Path: ${archivesFolderPath}`);
            console.log(`   Folder ID: ${archivesFolder.id}\n`);
            
            // List contents of Archives folder
            const children = await graphClient
                .api(`/sites/${site.id}/drive/items/${archivesFolder.id}/children`)
                .get();
            
            console.log(`   📁 Contents of Archives folder (${children.value.length} items):`);
            children.value.forEach(item => {
                const type = item.folder ? '📁 Folder' : '📄 File';
                console.log(`      ${type}: ${item.name}`);
                
                // If it's a sprint folder, list its contents
                if (item.folder && item.name.startsWith('Sprint_')) {
                    graphClient
                        .api(`/sites/${site.id}/drive/items/${item.id}/children`)
                        .get()
                        .then(sprintContents => {
                            console.log(`         └─ Contains ${sprintContents.value.length} files`);
                        })
                        .catch(() => {});
                }
            });
        } catch (error) {
            console.log(`   ❌ Archives folder NOT found at: ${archivesFolderPath}`);
            console.log(`   Error: ${error.message}`);
        }
        
        console.log('\n');
        
        // Test 3: Summary
        console.log('3️⃣ Summary of paths for archive functionality:\n');
        console.log('   Archive Excel: /General/MARKETING & COMMUNICATIONS/Projects/Content approval/Content Review sheet Archives.xlsx');
        console.log('   Archives Folder: /General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives');
        console.log('   Sprint folders go inside Archives folder as: Archives/Sprint_{name}/');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testCorrectArchivePath().then(() => {
    console.log('\n✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});