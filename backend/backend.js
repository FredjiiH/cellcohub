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

// Helper to read/write team data
function readTeam() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeTeam(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
  res.json(readTeam());
});

// Add or update a team member
app.post('/api/team', (req, res) => {
  const { name, capacity } = req.body;
  if (!name || typeof capacity !== 'number') {
    return res.status(400).json({ error: 'Name and capacity required' });
  }
  let team = readTeam();
  const idx = team.findIndex(m => m.name === name);
  if (idx >= 0) {
    team[idx].capacity = capacity;
  } else {
    team.push({ name, capacity });
  }
  writeTeam(team);
  res.json(team);
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
}); 