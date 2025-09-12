require('dotenv').config();
const ExcelService = require('./services/excelService');
const GraphClientService = require('./services/graphClient');

async function testCurrentRowStructure() {
    console.log('🔍 Testing current row structure\n');
    
    const accessToken = process.env.TEST_ACCESS_TOKEN;
    if (!accessToken || accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
        console.log('❌ Please set TEST_ACCESS_TOKEN in your .env file');
        return;
    }
    
    try {
        // Initialize Excel service
        const excelService = new ExcelService();
        excelService.graphClientService = new GraphClientService();
        excelService.graphClientService.setAccessToken(accessToken);
        excelService.graphClient = excelService.graphClientService.getClient();
        
        await excelService.initialize();
        
        console.log('1️⃣ Checking Step1_Review structure...\n');
        
        // Get a sample row from Step1_Review
        const step1Rows = await excelService.getAllTableRows('Step1_Review');
        if (step1Rows.length > 0) {
            const sampleRow = step1Rows[0];
            console.log(`Step1_Review has ${sampleRow.values[0].length} columns`);
            console.log('Column values:');
            sampleRow.values[0].forEach((value, index) => {
                console.log(`  ${index}: "${value}"`);
            });
        } else {
            console.log('No rows found in Step1_Review');
        }
        
        console.log('\n2️⃣ Checking MCL_Review structure...\n');
        
        // Get a sample row from MCL_Review  
        const mclRows = await excelService.getAllTableRows('MCL_Review');
        if (mclRows.length > 0) {
            const sampleRow = mclRows[0];
            console.log(`MCL_Review has ${sampleRow.values[0].length} columns`);
            console.log('Column values:');
            sampleRow.values[0].forEach((value, index) => {
                console.log(`  ${index}: "${value}"`);
            });
        } else {
            console.log('No rows found in MCL_Review');
        }
        
        console.log('\n3️⃣ Checking Archive table structure...\n');
        
        // Check archive table structure
        const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
        const site = await excelService.graphClient.api(`/sites/${siteUrl}`).get();
        const archivePath = '/General/MARKETING & COMMUNICATIONS/Projects/Content approval/Archives/Content Review sheet Archives.xlsx';
        const archiveFile = await excelService.graphClient.api(`/sites/${site.id}/drive/root:${archivePath}`).get();
        
        const columns = await excelService.graphClient
            .api(`/sites/${site.id}/drive/items/${archiveFile.id}/workbook/tables/Content_Review_Archives/columns`)
            .get();
        
        console.log(`Archive table has ${columns.value.length} columns:`);
        columns.value.forEach((col, index) => {
            console.log(`  ${index}: ${col.name}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testCurrentRowStructure().then(() => {
    console.log('\n✅ Test complete');
}).catch(err => {
    console.error('❌ Test failed:', err);
});