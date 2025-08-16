// Test script to switch Fredrik's role between admin and user
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { TeamMember, ROLES, MODULES, SUBCATEGORIES } = require('./models/teamMember');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function switchRole(newRole) {
  try {
    await client.connect();
    const db = client.db('mondayWorkloadTracker');
    const collection = db.collection('team');
    
    // Get current Fredrik record
    const fredrik = await collection.findOne({ name: 'Fredrik Helander' });
    if (!fredrik) {
      console.log('Fredrik not found');
      return;
    }
    
    // Create updated record with new role
    const updatedFredrik = new TeamMember({
      name: 'Fredrik Helander',
      email: 'fredrik.helander@cellcolabs.com',
      capacity: 65,
      role: newRole,
      permissions: newRole === ROLES.ADMIN ? {
        modules: Object.values(MODULES),
        subcategories: Object.values(SUBCATEGORIES)
      } : {
        modules: [MODULES.MONDAY_DATA],
        subcategories: [
          SUBCATEGORIES.MONDAY_DATA_VIEW_DASHBOARD,
          SUBCATEGORIES.MONDAY_DATA_VIEW_ANALYTICS
        ]
      }
    });
    
    await collection.replaceOne(
      { name: 'Fredrik Helander' },
      updatedFredrik.toJSON()
    );
    
    console.log(`✅ Fredrik's role changed to: ${newRole}`);
    console.log(`Permissions: ${updatedFredrik.permissions.modules.join(', ')}`);
    console.log('\n🔄 Refresh your browser to see the changes');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Get command line argument
const role = process.argv[2];

if (role === 'admin') {
  switchRole(ROLES.ADMIN);
} else if (role === 'user') {
  switchRole(ROLES.USER);
} else {
  console.log('Usage: node test-rbac.js [admin|user]');
  console.log('\nExamples:');
  console.log('  node test-rbac.js user   # Switch Fredrik to user role');
  console.log('  node test-rbac.js admin  # Switch Fredrik back to admin role');
}