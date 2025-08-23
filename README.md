# CellcoHub

A React TypeScript application for tracking team workload from Monday.com boards with sprint-specific capacity overrides and content approval automation.

## Project Structure

```
cellcohub/
├── frontend/          # React frontend application
│   ├── src/          # React source code
│   ├── public/       # Static assets
│   ├── package.json  # Frontend dependencies
│   ├── tsconfig.json # TypeScript configuration
│   └── .env         # Frontend environment variables
├── backend/          # Node.js backend API
│   ├── backend.js   # Express server
│   ├── package.json # Backend dependencies
│   ├── team.json    # Team member data
│   └── capacity_overrides.json # Sprint overrides
└── README.md        # This file
```

## Quick Start

### Prerequisites
- Node.js (>=16.0.0)
- npm or yarn

### Development

1. **Start the Backend:**
   ```bash
   cd backend
   npm install
   npm start
   ```
   Backend will run on http://localhost:4000

2. **Start the Frontend:**
   ```bash
   cd frontend
   npm install
   npm start
   ```
   Frontend will run on http://localhost:3000

### Environment Variables

Create a `.env` file in the `frontend/` directory:
```
REACT_APP_MONDAY_API_TOKEN=your_monday_api_token
REACT_APP_MONDAY_BOARD_ID=your_board_id
REACT_APP_BACKEND_URL=http://localhost:4000
```

## Features

- **Monday.com Integration:** Fetches tasks and effort data from Monday.com boards
- **Team Capacity Management:** Set default capacities for team members
- **Sprint Overrides:** Override capacities for specific sprints/groups
- **Workload Dashboard:** Visual representation of team workload vs capacity
- **Board Inspector:** Debug tool to explore Monday.com board structure

## Deployment

### Backend (Render.com)
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:** `NODE_ENV=production`

### Frontend (Render.com)
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `build`
- **Environment Variables:** 
  - `REACT_APP_MONDAY_API_TOKEN`
  - `REACT_APP_MONDAY_BOARD_ID`
  - `REACT_APP_BACKEND_URL`

## API Endpoints

### Backend API (Port 4000)
- `GET /api/team` - Get all team members
- `POST /api/team` - Add/update team member
- `DELETE /api/team/:name` - Delete team member
- `GET /api/overrides/:groupId` - Get overrides for a group
- `POST /api/overrides/:groupId` - Set override for a group
- `DELETE /api/overrides/:groupId/:name` - Remove override

## Security

- API tokens are stored in environment variables
- `.env` files are gitignored
- CORS enabled for local development
