// Check MongoDB team data
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'mondayWorkloadTracker';
const TEAM_COLLECTION = 'team';

async function checkTeamData() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const team = await db.collection(TEAM_COLLECTION).find({}).toArray();
    
    console.log('=== Current Team Data in MongoDB ===');
    console.log(`Total team members: ${team.length}`);
    team.forEach((member, index) => {
      console.log(`${index + 1}. ${member.name} - Capacity: ${member.capacity}`);
    });
    
    await client.close();
    
  } catch (error) {
    console.error('Error checking MongoDB:', error);
  }
}

checkTeamData();
