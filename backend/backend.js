// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { validateToken, checkDomain } = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_FILE = path.join(__dirname, 'team.json');
const OVERRIDES_FILE = path.join(__dirname, 'capacity_overrides.json');

app.use(cors());
app.use(bodyParser.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});

// Helper to read/write team data
function readTeam() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log(`Team file does not exist: ${DATA_FILE}`);
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    console.log(`Read team data from ${DATA_FILE}:`, data);
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading team file ${DATA_FILE}:`, error);
    return [];
  }
}

function writeTeam(data) {
  try {
    console.log(`Writing team data to ${DATA_FILE}:`, JSON.stringify(data, null, 2));
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Successfully wrote team data to ${DATA_FILE}`);
  } catch (error) {
    console.error(`Error writing team file ${DATA_FILE}:`, error);
    throw error;
  }
}

// Helper to read/write overrides
function readOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
}
function writeOverrides(data) {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(data, null, 2));
}

// Apply authentication to all API routes
app.use('/api', validateToken, checkDomain);

// Get all team members
app.get('/api/team', (req, res) => {
  console.log('=== GET TEAM MEMBERS ===');
  console.log('User email:', req.headers['x-user-email']);
  console.log('User name:', req.headers['x-user-name']);
  
  try {
    const team = readTeam();
    console.log('Returning team data:', team);
    res.json(team);
  } catch (error) {
    console.error('Error in GET /api/team:', error);
    res.status(500).json({ error: 'Failed to read team data' });
  }
});

// Add or update a team member
app.post('/api/team', (req, res) => {
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
    let team = readTeam();
    console.log('Current team before update:', team);
    
    const idx = team.findIndex(m => m.name === name);
    if (idx >= 0) {
      console.log(`Updating existing member: ${name} with capacity ${capacity}`);
      team[idx].capacity = capacity;
    } else {
      console.log(`Adding new member: ${name} with capacity ${capacity}`);
      team.push({ name, capacity });
    }
    
    console.log('Team after update:', team);
    writeTeam(team);
    
    console.log('Successfully updated team data');
    res.json(team);
  } catch (error) {
    console.error('Error in POST /api/team:', error);
    res.status(500).json({ error: 'Failed to update team data' });
  }
});

// Delete a team member
app.delete('/api/team/:name', (req, res) => {
  let team = readTeam();
  team = team.filter(m => m.name !== req.params.name);
  writeTeam(team);
  res.json(team);
});

// Get all overrides for a sprint/group
app.get('/api/overrides/:groupId', (req, res) => {
  const overrides = readOverrides();
  res.json(overrides[req.params.groupId] || {});
});

// Set or update an override for a user in a sprint/group
app.post('/api/overrides/:groupId', (req, res) => {
  const { name, capacity } = req.body;
  if (!name || typeof capacity !== 'number') {
    return res.status(400).json({ error: 'Name and capacity required' });
  }
  const overrides = readOverrides();
  if (!overrides[req.params.groupId]) overrides[req.params.groupId] = {};
  overrides[req.params.groupId][name] = capacity;
  writeOverrides(overrides);
  res.json(overrides[req.params.groupId]);
});

// Delete an override for a user in a sprint/group
app.delete('/api/overrides/:groupId/:name', (req, res) => {
  const overrides = readOverrides();
  if (overrides[req.params.groupId]) {
    delete overrides[req.params.groupId][req.params.name];
    writeOverrides(overrides);
  }
  res.json(overrides[req.params.groupId] || {});
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Team data file: ${DATA_FILE}`);
  console.log(`Overrides file: ${OVERRIDES_FILE}`);
  
  // Log initial team data
  try {
    const initialTeam = readTeam();
    console.log('Initial team data on startup:', initialTeam);
  } catch (error) {
    console.error('Error reading initial team data:', error);
  }
}); 