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

// Test endpoint to check service creation (bypassing auth middleware)
app.get('/test/content-approval/service-creation', async (req, res) => {
  try {
    console.log('Testing service creation...');
    const ContentApprovalManager = require('./services/contentApprovalManager');
    console.log('ContentApprovalManager class loaded successfully');
    
    const testManager = new ContentApprovalManager();
    console.log('ContentApprovalManager instance created successfully');
    
    res.json({ 
      message: 'Service creation test passed',
      services: {
        fileMonitor: !!testManager.fileMonitorService,
        statusRouter: !!testManager.statusRouterService,
        excel: !!testManager.excelService,
        sharePoint: !!testManager.sharePointService
      }
    });
  } catch (error) {
    console.error('Service creation test failed:', error);
    res.status(500).json({ 
      error: 'Service creation failed', 
      details: error.message,
      stack: error.stack
    });
  }
});

// Test start endpoint without auth for debugging (bypassing auth middleware)
app.post('/test/content-approval/start-test', async (req, res) => {
  try {
    console.log('=== TESTING START WITHOUT AUTH ===');
    
    // Fake access token for testing
    const fakeToken = 'test-token-123';
    
    console.log('Creating new ContentApprovalManager...');
    const testManager = new ContentApprovalManager();
    
    console.log('Starting content approval manager with fake token...');
    await testManager.start(fakeToken);
    
    console.log('Getting service status...');
    const status = await testManager.getServiceStatus();
    
    res.json({ 
      message: 'Test start completed (this will fail at SharePoint connection)', 
      status,
      note: 'This is expected to fail at SharePoint connection since we used a fake token'
    });
  } catch (error) {
    console.error('Test start failed (expected):', error.message);
    res.json({ 
      message: 'Test start failed as expected', 
      error: error.message,
      note: 'This failure is expected - it shows the initialization process works until SharePoint connection'
    });
  }
});

// Test SharePoint permissions and connectivity
app.post('/test/sharepoint-permissions', async (req, res) => {
  try {
    console.log('=== TESTING SHAREPOINT PERMISSIONS ===');
    
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const GraphClientService = require('./services/graphClient');
    const graphService = new GraphClientService();
    graphService.setAccessToken(accessToken);
    const graphClient = graphService.getClient();

    const tests = [];
    
    // Test 1: Basic site access
    try {
      console.log('Testing basic site access...');
      const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
      const site = await graphClient.api(`/sites/${siteUrl}`).get();
      tests.push({
        name: 'Site Access',
        status: 'success',
        details: `Site ID: ${site.id}`,
        siteId: site.id
      });
    } catch (error) {
      tests.push({
        name: 'Site Access',
        status: 'failed',
        error: error.message,
        statusCode: error.statusCode || error.status
      });
    }

    // Test 2: Drive access
    let driveId = null;
    try {
      console.log('Testing drive access...');
      const siteUrl = 'cellcoab.sharepoint.com:/sites/MarketingSales';
      const site = await graphClient.api(`/sites/${siteUrl}`).get();
      const drive = await graphClient.api(`/sites/${site.id}/drive`).get();
      driveId = drive.id;
      tests.push({
        name: 'Drive Access',
        status: 'success',
        details: `Drive ID: ${drive.id}`,
        driveId: drive.id
      });
    } catch (error) {
      tests.push({
        name: 'Drive Access',
        status: 'failed',
        error: error.message,
        statusCode: error.statusCode || error.status
      });
    }

    // Test 3: Test folder access
    if (driveId) {
      try {
        console.log('Testing test folder access...');
        const testFolderPath = '/Shared Documents/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test';
        const testFolder = await graphClient.api(`/drives/${driveId}/root:${testFolderPath}`).get();
        tests.push({
          name: 'Test Folder Access',
          status: 'success',
          details: `Folder ID: ${testFolder.id}`,
          folderId: testFolder.id
        });
      } catch (error) {
        tests.push({
          name: 'Test Folder Access',
          status: 'failed',
          error: error.message,
          statusCode: error.statusCode || error.status
        });
      }
    }

    // Test 4: Excel file access
    if (driveId) {
      const excelFiles = [
        '/Shared Documents/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content_Review_step1 Test.xlsx',
        '/Shared Documents/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content Review sheet Medical Regulatory and Legal Test.xlsx'
      ];

      for (const filePath of excelFiles) {
        try {
          console.log(`Testing Excel file access: ${filePath}`);
          const file = await graphClient.api(`/drives/${driveId}/root:${filePath}`).get();
          tests.push({
            name: `Excel File: ${filePath.split('/').pop()}`,
            status: 'success',
            details: `File ID: ${file.id}`,
            fileId: file.id
          });
        } catch (error) {
          tests.push({
            name: `Excel File: ${filePath.split('/').pop()}`,
            status: 'failed',
            error: error.message,
            statusCode: error.statusCode || error.status,
            filePath: filePath
          });
        }
      }
    }

    res.json({
      message: 'SharePoint permissions test completed',
      tests: tests,
      summary: {
        total: tests.length,
        passed: tests.filter(t => t.status === 'success').length,
        failed: tests.filter(t => t.status === 'failed').length
      }
    });
  } catch (error) {
    console.error('SharePoint permissions test failed:', error);
    res.status(500).json({
      error: 'Test failed',
      details: error.message
    });
  }
});

// Get content approval service status
app.get('/api/content-approval/status', async (req, res) => {
  try {
    if (!contentApprovalManager) {
      return res.json({
        initialized: false,
        fileMonitor: { running: false, intervalMinutes: 2 },
        statusRouter: { running: false, intervalMinutes: 5 },
        message: 'Service not started - click Start Services to begin'
      });
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
      return res.json({ 
        status: 'not-started', 
        message: 'Content approval service not started yet',
        timestamp: new Date().toISOString()
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
    console.log('=== STARTING CONTENT APPROVAL SERVICES ===');
    console.log('Request headers:', Object.keys(req.headers));
    
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      console.error('No access token provided in Authorization header');
      return res.status(401).json({ error: 'Access token required' });
    }

    console.log('Access token received (length):', accessToken.length);

    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager...');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    console.log('Starting content approval manager with access token...');
    await contentApprovalManager.start(accessToken);
    
    console.log('Getting service status...');
    const status = await contentApprovalManager.getServiceStatus();
    
    console.log('Services started successfully:', status);
    res.json({ message: 'Content approval services started', status });
  } catch (error) {
    console.error('Error starting content approval services:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Failed to start services', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for file-check trigger');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for file-check');
    await contentApprovalManager.initialize(accessToken);
    
    await contentApprovalManager.triggerFileCheck();
    res.json({ message: 'File check triggered successfully' });
  } catch (error) {
    console.error('Error triggering file check:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to trigger file check' });
  }
});

app.post('/api/content-approval/trigger/status-check', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for status-check trigger');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for status-check');
    await contentApprovalManager.initialize(accessToken);
    
    await contentApprovalManager.triggerStatusCheck();
    res.json({ message: 'Status check triggered successfully' });
  } catch (error) {
    console.error('Error triggering status check:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to trigger status check' });
  }
});

// Data access endpoints
app.get('/api/content-approval/step1-data', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for step1-data');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for step1-data');
    await contentApprovalManager.initialize(accessToken);
    
    const data = await contentApprovalManager.getStep1Data();
    res.json(data);
  } catch (error) {
    console.error('Error getting Step1 data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get Step1 data' });
  }
});

app.get('/api/content-approval/mrl-data', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for mrl-data');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for mrl-data');
    await contentApprovalManager.initialize(accessToken);
    
    const data = await contentApprovalManager.getMRLData();
    res.json(data);
  } catch (error) {
    console.error('Error getting MRL data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get MRL data' });
  }
});

app.get('/api/content-approval/sharepoint-files', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for sharepoint-files');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for sharepoint-files');
    await contentApprovalManager.initialize(accessToken);
    
    const files = await contentApprovalManager.getReadyToReviewFiles();
    res.json(files);
  } catch (error) {
    console.error('Error getting SharePoint files:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get SharePoint files' });
  }
});

// Logging and monitoring endpoints
app.get('/api/content-approval/logs/processing', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for processing logs');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for processing logs');
    await contentApprovalManager.initialize(accessToken);
    
    const limit = parseInt(req.query.limit) || 100;
    const logs = await contentApprovalManager.getProcessingLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error getting processing logs:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get processing logs' });
  }
});

app.get('/api/content-approval/logs/errors', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for error logs');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for error logs');
    await contentApprovalManager.initialize(accessToken);
    
    const limit = parseInt(req.query.limit) || 50;
    const logs = await contentApprovalManager.getErrorLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error getting error logs:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get error logs' });
  }
});

app.get('/api/content-approval/stats', async (req, res) => {
  try {
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }
    const accessToken = authHeader.substring(7);
    
    // Initialize manager if needed
    if (!contentApprovalManager) {
      console.log('Creating new ContentApprovalManager for stats');
      contentApprovalManager = new ContentApprovalManager();
    }
    
    // Always initialize/update with the current user's token
    console.log('Initializing with user token for stats');
    await contentApprovalManager.initialize(accessToken);
    
    const stats = await contentApprovalManager.getProcessingStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting processing stats:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to get processing stats' });
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
