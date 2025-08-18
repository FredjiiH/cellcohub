// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { validateToken, checkDomain } = require('./authMiddleware');
const ContentApprovalManager = require('./services/contentApprovalManager');
const { TeamMember, ROLES, MODULES, SUBCATEGORIES } = require('./models/teamMember');

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'mondayWorkloadTracker';
const TEAM_COLLECTION = 'team';
const OVERRIDES_COLLECTION = 'overrides';

let db;
let contentApprovalManager;

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
      console.log('Initializing team collection with enhanced team member data');
      const defaultMembers = [
        new TeamMember({
          name: 'Fredrik Helander',
          email: 'fredrik.helander@cellcolabs.com',
          capacity: 65,
          role: ROLES.ADMIN
        }),
        new TeamMember({
          name: 'Fanny Wilgodt', 
          email: 'fanny.wilgodt@cellcolabs.com',
          capacity: 65,
          role: ROLES.USER,
          permissions: {
            modules: [MODULES.MONDAY_DATA],
            subcategories: [
              SUBCATEGORIES.MONDAY_DATA_VIEW_DASHBOARD,
              SUBCATEGORIES.MONDAY_DATA_MANAGE_CAPACITY,
              SUBCATEGORIES.MONDAY_DATA_VIEW_ANALYTICS
            ]
          }
        })
      ];
      
      await db.collection(TEAM_COLLECTION).insertMany(defaultMembers.map(m => m.toJSON()));
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

async function updateTeamMember(memberData) {
  try {
    const { name, email, capacity, role, permissions } = memberData;
    
    // Validate the data
    const validationErrors = TeamMember.validate(memberData);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    // Check if member exists
    const existingMember = await db.collection(TEAM_COLLECTION).findOne({ name: name });
    
    let teamMember;
    if (existingMember) {
      // Update existing member
      teamMember = new TeamMember(existingMember);
      teamMember.email = email || teamMember.email;
      teamMember.capacity = capacity !== undefined ? capacity : teamMember.capacity;
      
      if (role && role !== teamMember.role) {
        teamMember.updateRole(role);
      }
      
      if (permissions) {
        teamMember.permissions = permissions;
        teamMember.updatedAt = new Date();
      }
    } else {
      // Create new member
      teamMember = new TeamMember({
        name,
        email,
        capacity,
        role,
        permissions
      });
    }

    const result = await db.collection(TEAM_COLLECTION).replaceOne(
      { name: name },
      teamMember.toJSON(),
      { upsert: true }
    );
    
    console.log(`Updated team member in MongoDB: ${name}`);
    return result;
  } catch (error) {
    console.error('Error updating team member in MongoDB:', error);
    throw error;
  }
}

async function getTeamMemberByEmail(email) {
  try {
    const member = await db.collection(TEAM_COLLECTION).findOne({ email: email });
    return member ? new TeamMember(member) : null;
  } catch (error) {
    console.error('Error getting team member by email:', error);
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
  
  const { name, email, capacity, role, permissions } = req.body;
  if (!name) {
    console.error('Invalid request: missing name');
    return res.status(400).json({ error: 'Name is required' });
  }
  
  try {
    // Check if current user has permission to manage team members
    const currentUserEmail = req.headers['x-user-email'];
    const currentUser = await getTeamMemberByEmail(currentUserEmail);
    
    if (!currentUser || !currentUser.hasSubcategoryAccess(SUBCATEGORIES.TEAM_SETTINGS_MANAGE_USERS)) {
      return res.status(403).json({ error: 'Insufficient permissions to manage team members' });
    }

    await updateTeamMember({ name, email, capacity, role, permissions });
    const team = await getTeam();
    console.log('Successfully updated team data');
    res.json(team);
  } catch (error) {
    console.error('Error in POST /api/team:', error);
    res.status(500).json({ error: error.message || 'Failed to update team data' });
  }
});

// Delete a team member
app.delete('/api/team/:name', async (req, res) => {
  try {
    // Check if current user has permission to manage team members
    const currentUserEmail = req.headers['x-user-email'];
    const currentUser = await getTeamMemberByEmail(currentUserEmail);
    
    if (!currentUser || !currentUser.hasSubcategoryAccess(SUBCATEGORIES.TEAM_SETTINGS_MANAGE_USERS)) {
      return res.status(403).json({ error: 'Insufficient permissions to delete team members' });
    }

    await deleteTeamMember(req.params.name);
    const team = await getTeam();
    res.json(team);
  } catch (error) {
    console.error('Error in DELETE /api/team:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// Get current user's permissions
app.get('/api/user/permissions', async (req, res) => {
  try {
    const currentUserEmail = req.headers['x-user-email'];
    const currentUser = await getTeamMemberByEmail(currentUserEmail);
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found in team database' });
    }

    res.json({
      user: currentUser.toJSON(),
      hasAccess: {
        teamSettings: currentUser.hasModuleAccess(MODULES.TEAM_SETTINGS),
        contentApproval: currentUser.hasModuleAccess(MODULES.CONTENT_APPROVAL),
        mondayData: currentUser.hasModuleAccess(MODULES.MONDAY_DATA)
      },
      subcategoryAccess: {
        canManageUsers: currentUser.hasSubcategoryAccess(SUBCATEGORIES.TEAM_SETTINGS_MANAGE_USERS),
        canViewUsers: currentUser.hasSubcategoryAccess(SUBCATEGORIES.TEAM_SETTINGS_VIEW_USERS),
        canManageContentServices: currentUser.hasSubcategoryAccess(SUBCATEGORIES.CONTENT_APPROVAL_MANAGE_SERVICES),
        canViewContentLogs: currentUser.hasSubcategoryAccess(SUBCATEGORIES.CONTENT_APPROVAL_VIEW_LOGS),
        canUseMondayDashboard: currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_VIEW_DASHBOARD),
        canManageCapacity: currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_MANAGE_CAPACITY),
        canViewAnalytics: currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_VIEW_ANALYTICS),
        canUseBoardInspector: currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_BOARD_INSPECTOR)
      }
    });
  } catch (error) {
    console.error('Error getting user permissions:', error);
    res.status(500).json({ error: 'Failed to get user permissions' });
  }
});

// Get available roles and permissions metadata
app.get('/api/roles-permissions', async (req, res) => {
  try {
    res.json({
      roles: ROLES,
      modules: MODULES,
      subcategories: SUBCATEGORIES,
      defaultPermissions: {
        [ROLES.ADMIN]: {
          modules: Object.values(MODULES),
          subcategories: Object.values(SUBCATEGORIES)
        },
        [ROLES.USER]: {
          modules: [MODULES.MONDAY_DATA],
          subcategories: [
            SUBCATEGORIES.MONDAY_DATA_VIEW_DASHBOARD,
            SUBCATEGORIES.MONDAY_DATA_VIEW_ANALYTICS
          ]
        }
      }
    });
  } catch (error) {
    console.error('Error getting roles and permissions:', error);
    res.status(500).json({ error: 'Failed to get roles and permissions' });
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
    // Check if current user has permission to manage capacity
    const currentUserEmail = req.headers['x-user-email'];
    const currentUser = await getTeamMemberByEmail(currentUserEmail);
    
    if (!currentUser || !currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_MANAGE_CAPACITY)) {
      return res.status(403).json({ error: 'Insufficient permissions to manage capacity overrides' });
    }

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
    // Check if current user has permission to manage capacity
    const currentUserEmail = req.headers['x-user-email'];
    const currentUser = await getTeamMemberByEmail(currentUserEmail);
    
    if (!currentUser || !currentUser.hasSubcategoryAccess(SUBCATEGORIES.MONDAY_DATA_MANAGE_CAPACITY)) {
      return res.status(403).json({ error: 'Insufficient permissions to manage capacity overrides' });
    }

    await deleteOverride(req.params.groupId, req.params.name);
    const overrides = await getOverrides(req.params.groupId);
    res.json(overrides);
  } catch (error) {
    console.error('Error in DELETE /api/overrides:', error);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

// ============= CONTENT APPROVAL API ROUTES =============

// Get content approval service status
app.get('/api/content-approval/status', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const status = await contentApprovalManager.getServiceStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting content approval status:', error);
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

// Health check for content approval services
app.get('/api/content-approval/health', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ 
        status: 'unhealthy', 
        error: 'Content approval service not initialized' 
      });
    }
    
    const health = await contentApprovalManager.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start content approval services
app.post('/api/content-approval/start', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(401).json({ error: 'Access token required' });
    }

    if (!contentApprovalManager) {
      contentApprovalManager = new ContentApprovalManager();
    }
    
    await contentApprovalManager.start(accessToken);
    const status = await contentApprovalManager.getServiceStatus();
    res.json({ message: 'Content approval services started', status });
  } catch (error) {
    console.error('Error starting content approval services:', error);
    res.status(500).json({ error: 'Failed to start services' });
  }
});

// Stop content approval services
app.post('/api/content-approval/stop', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.json({ message: 'Content approval services not running' });
    }
    
    await contentApprovalManager.stop();
    const status = await contentApprovalManager.getServiceStatus();
    res.json({ message: 'Content approval services stopped', status });
  } catch (error) {
    console.error('Error stopping content approval services:', error);
    res.status(500).json({ error: 'Failed to stop services' });
  }
});

// Restart content approval services
app.post('/api/content-approval/restart', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      contentApprovalManager = new ContentApprovalManager();
    }
    
    await contentApprovalManager.restart();
    const status = await contentApprovalManager.getServiceStatus();
    res.json({ message: 'Content approval services restarted', status });
  } catch (error) {
    console.error('Error restarting content approval services:', error);
    res.status(500).json({ error: 'Failed to restart services' });
  }
});

// Manual triggers
app.post('/api/content-approval/trigger/file-check', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    await contentApprovalManager.triggerFileCheck();
    res.json({ message: 'File check triggered successfully' });
  } catch (error) {
    console.error('Error triggering file check:', error);
    res.status(500).json({ error: 'Failed to trigger file check' });
  }
});

app.post('/api/content-approval/trigger/status-check', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    await contentApprovalManager.triggerStatusCheck();
    res.json({ message: 'Status check triggered successfully' });
  } catch (error) {
    console.error('Error triggering status check:', error);
    res.status(500).json({ error: 'Failed to trigger status check' });
  }
});

// Data access endpoints
app.get('/api/content-approval/step1-data', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const data = await contentApprovalManager.getStep1Data();
    res.json(data);
  } catch (error) {
    console.error('Error getting Step1 data:', error);
    res.status(500).json({ error: 'Failed to get Step1 data' });
  }
});

app.get('/api/content-approval/mrl-data', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const data = await contentApprovalManager.getMRLData();
    res.json(data);
  } catch (error) {
    console.error('Error getting MRL data:', error);
    res.status(500).json({ error: 'Failed to get MRL data' });
  }
});

app.get('/api/content-approval/sharepoint-files', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const files = await contentApprovalManager.getReadyToReviewFiles();
    res.json(files);
  } catch (error) {
    console.error('Error getting SharePoint files:', error);
    res.status(500).json({ error: 'Failed to get SharePoint files' });
  }
});

// Logging and monitoring endpoints
app.get('/api/content-approval/logs/processing', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const limit = parseInt(req.query.limit) || 100;
    const logs = await contentApprovalManager.getProcessingLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error getting processing logs:', error);
    res.status(500).json({ error: 'Failed to get processing logs' });
  }
});

app.get('/api/content-approval/logs/errors', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const logs = await contentApprovalManager.getErrorLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error getting error logs:', error);
    res.status(500).json({ error: 'Failed to get error logs' });
  }
});

app.get('/api/content-approval/stats', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.status(503).json({ error: 'Content approval service not initialized' });
    }
    
    const stats = await contentApprovalManager.getProcessingStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting processing stats:', error);
    res.status(500).json({ error: 'Failed to get processing stats' });
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
