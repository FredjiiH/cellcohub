// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { validateToken, checkDomain } = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'mondayWorkloadTracker';
const TEAM_COLLECTION = 'team';
const OVERRIDES_COLLECTION = 'overrides';

let db;

// Connect to MongoDB
async function connectToMongo() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB successfully');
    
    // Initialize with default team data if collection is empty
    const teamCount = await db.collection(TEAM_COLLECTION).countDocuments();
    if (teamCount === 0) {
      console.log('Initializing team collection with default data');
      await db.collection(TEAM_COLLECTION).insertMany([
        { name: 'Fredrik Helander', capacity: 65 },
        { name: 'Fanny Wilgodt', capacity: 65 }
      ]);
    }
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

app.use(cors());
app.use(bodyParser.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});

// Helper functions for MongoDB operations
async function getTeam() {
  try {
    const team = await db.collection(TEAM_COLLECTION).find({}).toArray();
    console.log('Retrieved team data from MongoDB:', team);
    return team;
  } catch (error) {
    console.error('Error reading team from MongoDB:', error);
    throw error;
  }
}

async function updateTeamMember(name, capacity) {
  try {
    const result = await db.collection(TEAM_COLLECTION).updateOne(
      { name: name },
      { $set: { name: name, capacity: capacity } },
      { upsert: true }
    );
    console.log(`Updated team member in MongoDB: ${name} with capacity ${capacity}`);
    return result;
  } catch (error) {
    console.error('Error updating team member in MongoDB:', error);
    throw error;
  }
}

async function deleteTeamMember(name) {
  try {
    const result = await db.collection(TEAM_COLLECTION).deleteOne({ name: name });
    console.log(`Deleted team member from MongoDB: ${name}`);
    return result;
  } catch (error) {
    console.error('Error deleting team member from MongoDB:', error);
    throw error;
  }
}

async function getOverrides(groupId) {
  try {
    const override = await db.collection(OVERRIDES_COLLECTION).findOne({ groupId: groupId });
    return override ? override.overrides : {};
  } catch (error) {
    console.error('Error reading overrides from MongoDB:', error);
    return {};
  }
}

async function updateOverride(groupId, name, capacity) {
  try {
    const result = await db.collection(OVERRIDES_COLLECTION).updateOne(
      { groupId: groupId },
      { $set: { [`overrides.${name}`]: capacity } },
      { upsert: true }
    );
    console.log(`Updated override in MongoDB: ${groupId} - ${name}: ${capacity}`);
    return result;
  } catch (error) {
    console.error('Error updating override in MongoDB:', error);
    throw error;
  }
}

async function deleteOverride(groupId, name) {
  try {
    const result = await db.collection(OVERRIDES_COLLECTION).updateOne(
      { groupId: groupId },
      { $unset: { [`overrides.${name}`]: "" } }
    );
    console.log(`Deleted override from MongoDB: ${groupId} - ${name}`);
    return result;
  } catch (error) {
    console.error('Error deleting override from MongoDB:', error);
    throw error;
  }
}

// Apply authentication to all API routes
app.use('/api', validateToken, checkDomain);

// Get all team members
app.get('/api/team', async (req, res) => {
  console.log('=== GET TEAM MEMBERS ===');
  console.log('User email:', req.headers['x-user-email']);
  console.log('User name:', req.headers['x-user-name']);
  
  try {
    const team = await getTeam();
    console.log('Returning team data:', team);
    res.json(team);
  } catch (error) {
    console.error('Error in GET /api/team:', error);
    res.status(500).json({ error: 'Failed to read team data' });
  }
});

// Add or update a team member
app.post('/api/team', async (req, res) => {
  console.log('=== ADD/UPDATE TEAM MEMBER ===');
  console.log('Request body:', req.body);
  console.log('User email:', req.headers['x-user-email']);
  console.log('User name:', req.headers['x-user-name']);
  
  const { name, capacity } = req.body;
  if (!name || typeof capacity !== 'number') {
    console.error('Invalid request: missing name or capacity');
    return res.status(400).json({ error: 'Name and capacity required' });
  }
  
  try {
    await updateTeamMember(name, capacity);
    const team = await getTeam();
    console.log('Successfully updated team data');
    res.json(team);
  } catch (error) {
    console.error('Error in POST /api/team:', error);
    res.status(500).json({ error: 'Failed to update team data' });
  }
});

// Delete a team member
app.delete('/api/team/:name', async (req, res) => {
  try {
    await deleteTeamMember(req.params.name);
    const team = await getTeam();
    res.json(team);
  } catch (error) {
    console.error('Error in DELETE /api/team:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// Get all overrides for a sprint/group
app.get('/api/overrides/:groupId', async (req, res) => {
  try {
    const overrides = await getOverrides(req.params.groupId);
    res.json(overrides);
  } catch (error) {
    console.error('Error in GET /api/overrides:', error);
    res.status(500).json({ error: 'Failed to read overrides' });
  }
});

// Set or update an override for a user in a sprint/group
app.post('/api/overrides/:groupId', async (req, res) => {
  const { name, capacity } = req.body;
  if (!name || typeof capacity !== 'number') {
    return res.status(400).json({ error: 'Name and capacity required' });
  }
  
  try {
    await updateOverride(req.params.groupId, name, capacity);
    const overrides = await getOverrides(req.params.groupId);
    res.json(overrides);
  } catch (error) {
    console.error('Error in POST /api/overrides:', error);
    res.status(500).json({ error: 'Failed to update override' });
  }
});

// Delete an override for a user in a sprint/group
app.delete('/api/overrides/:groupId/:name', async (req, res) => {
  try {
    await deleteOverride(req.params.groupId, req.params.name);
    const overrides = await getOverrides(req.params.groupId);
    res.json(overrides);
  } catch (error) {
    console.error('Error in DELETE /api/overrides:', error);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

// Get user permissions
app.get('/api/user/permissions', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    const userName = req.headers['x-user-name'];

    if (!userEmail || !userName) {
      return res.status(400).json({ error: 'User email and name required in headers' });
    }

    // Get user from team collection
    const team = await getTeam();
    const user = team.find(member => member.email.toLowerCase() === userEmail.toLowerCase());

    if (!user) {
      // Default permissions for users not in team (limited access)
      return res.json({
        user: {
          name: userName,
          email: userEmail,
          capacity: 40,
          role: 'user',
          permissions: {
            modules: ['monday-data'],
            subcategories: ['canUseMondayDashboard', 'canViewAnalytics']
          }
        },
        hasAccess: {
          teamSettings: false,
          contentApproval: false,
          mondayData: true
        },
        subcategoryAccess: {
          canManageUsers: false,
          canViewUsers: false,
          canManageContentServices: false,
          canViewContentLogs: false,
          canUseMondayDashboard: true,
          canManageCapacity: false,
          canViewAnalytics: true,
          canUseBoardInspector: false
        }
      });
    }

    // User found in team - return their permissions
    const hasAccess = {
      teamSettings: user.role === 'admin' || user.permissions.modules.includes('team-settings'),
      contentApproval: user.role === 'admin' || user.permissions.modules.includes('content-approval'),
      mondayData: user.role === 'admin' || user.permissions.modules.includes('monday-data')
    };

    const subcategoryAccess = {
      canManageUsers: user.role === 'admin' || user.permissions.subcategories.includes('canManageUsers'),
      canViewUsers: user.role === 'admin' || user.permissions.subcategories.includes('canViewUsers'),
      canManageContentServices: user.role === 'admin' || user.permissions.subcategories.includes('canManageContentServices'),
      canViewContentLogs: user.role === 'admin' || user.permissions.subcategories.includes('canViewContentLogs'),
      canUseMondayDashboard: user.role === 'admin' || user.permissions.subcategories.includes('canUseMondayDashboard'),
      canManageCapacity: user.role === 'admin' || user.permissions.subcategories.includes('canManageCapacity'),
      canViewAnalytics: user.role === 'admin' || user.permissions.subcategories.includes('canViewAnalytics'),
      canUseBoardInspector: user.role === 'admin' || user.permissions.subcategories.includes('canUseBoardInspector')
    };

    res.json({
      user,
      hasAccess,
      subcategoryAccess
    });
  } catch (error) {
    console.error('Error in GET /api/user/permissions:', error);
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

// Start server after MongoDB connection
async function startServer() {
  await connectToMongo();
  
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`MongoDB URI: ${MONGODB_URI}`);
    console.log(`Database: ${DB_NAME}`);
    
    // Log initial team data
    getTeam().then(team => {
      console.log('Initial team data on startup:', team);
    }).catch(error => {
      console.error('Error reading initial team data:', error);
    });
  });
}

startServer().catch(console.error);
