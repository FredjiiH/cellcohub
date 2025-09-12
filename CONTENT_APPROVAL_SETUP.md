# Content Approval Module Setup Guide

## Overview
This module integrates SharePoint content approval workflows with your Monday workload app, replacing Power Automate flows with reliable custom automation.

## Azure AD App Registration Setup

### 1. Navigate to Azure AD App Registration
- Go to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations
- Find your existing app registration: `161407e5-d9c8-47f0-b8d2-a96648337b0c`

### 2. Add Required API Permissions
Navigate to **API permissions** and add these Microsoft Graph permissions:

#### Application Permissions (for backend service):
- `Sites.ReadWrite.All` - Read and write to all site collections
- `Files.ReadWrite.All` - Read and write all files
- `Sites.FullControl.All` - Full control of SharePoint sites (alternative if above doesn't work)

#### Steps to add permissions:
1. Click "Add a permission"
2. Select "Microsoft Graph"
3. Choose "Application permissions"
4. Search for and select each permission listed above
5. Click "Add permissions"
6. **Important**: Click "Grant admin consent" for your tenant

### 3. Verify Client Secret
Ensure your existing client secret is configured in your `.env` file (see Environment Configuration section below).

## SharePoint Site Configuration

### Verify Site Access
Your site: `https://cellcoab.sharepoint.com/sites/MarketingSales`

### Required Folders (TEST ENVIRONMENT):
1. **Ready to Review Test** (source folder):
   `/Shared Documents/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Ready to Review Test/`

2. **Final organization Test** (target folder):
   `/Shared Documents/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Final organization Test/`
   *(Will be created automatically if it doesn't exist)*

### Excel Files (TEST ENVIRONMENT):
1. **Step 1 Review File**:
   `/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content_Review_step1 Test.xlsx`
   - Table name: `Step1_Review`

2. **MRL Review File**:
   `/General/MARKETING & COMMUNICATIONS/Projects/Content approval Test/Content Review sheet Medical Regulatory and Legal Test.xlsx`
   - Table name: `MRL_Review`

## Environment Configuration

Create a `.env` file in your `backend/` directory with the following structure:
```env
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_TENANT_ID=your_azure_tenant_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
MONGODB_URI=your_mongodb_connection_string_here
```

**Important**: 
- Replace the placeholder values with your actual credentials
- Never commit the `.env` file to version control
- Keep these credentials secure and rotate them regularly

## Starting the Content Approval Services

### 1. Start the Backend
```bash
cd backend
npm start
```

### 2. Start the Frontend
```bash
cd frontend
npm start
```

### 3. Access the Content Approval Dashboard
1. Navigate to your app: `http://localhost:3000`
2. Sign in with your Azure AD account
3. Click the **"Content Approval"** tab
4. Use the **"Start Services"** button to begin automation

## Service Features

### File Monitor Service
- **Function**: Monitors SharePoint "Ready to Review" folder for new files
- **Frequency**: Checks every 2 minutes
- **Actions**: 
  - Parses filename format: `{Purpose} - {DescriptiveName} - {yyyymmdd} - {Version}`
  - Adds entries to Step1_Review Excel table
  - Logs all processing activities

### Status Router Service  
- **Function**: Monitors Step1_Review table for status changes
- **Frequency**: Checks every 5 minutes
- **Actions**:
  - **"Needs MRL Review"**: De-duplicates and adds to MRL_Review table
  - **"Fast track"**: Moves files to Final organization folder
  - Updates routing timestamps and audit trails

### Manual Controls
- **Start/Stop/Restart**: Control service status
- **Manual Triggers**: Force immediate file check or status processing
- **Real-time Monitoring**: View processing logs and statistics

## Monitoring and Troubleshooting

### Dashboard Features
- Service status indicators
- Real-time processing logs
- Error tracking
- Processing statistics
- Manual trigger controls

### Common Issues
1. **Permission Errors**: Ensure Azure AD app has proper permissions and admin consent
2. **File Not Found**: Verify SharePoint folder paths and Excel file locations
3. **Table Errors**: Confirm Excel table names match exactly: `Step1_Review` and `MRL_Review`
4. **MongoDB Errors**: Check MongoDB connection string and network access

### Logs Location
- Processing logs stored in MongoDB `processing_logs` collection
- Error logs stored in MongoDB `error_logs` collection
- Backend console shows detailed operation logs

## Migration from Power Automate

### Safe Migration Process
1. **Phase 1**: Start content approval services alongside existing Power Automate flows
2. **Phase 2**: Monitor for 1-2 weeks to ensure reliability
3. **Phase 3**: Disable Power Automate flows once confident in new system

### Rollback Plan
If issues occur, you can:
1. Stop the content approval services from the dashboard
2. Re-enable your existing Power Automate flows
3. The Excel tables remain untouched during the transition

## File Naming Convention

Files can follow either of these patterns:

**5-part pattern (with explicit Target Audience):**
```
{Purpose} - {Target Audience} - {Descriptive Name} - {yyyymmdd} - {Version}.extension
```

**4-part pattern (Target Audience optional/embedded):**
```
{Purpose} - {Descriptive Name} - {yyyymmdd} - {Version}.extension
```

Examples:
- 5-part: `FAQ - NonHCP - OA - 20250826 - V2.docx`
  - Purpose: "FAQ"
  - Target Audience: "NonHCP"
  - Descriptive Name: "OA"
  - Version Date: "2025-08-26"
  - Version: "V2"

- 4-part: `Toolkit - MSCs Facts sheet - 20250820 - V1.docx`
  - Purpose: "Toolkit"
  - Target Audience: "" (empty)
  - Descriptive Name: "MSCs Facts sheet"
  - Version Date: "2025-08-20"
  - Version: "V1"

## Next Steps

1. **Grant Azure AD permissions** as outlined above
2. **Start the services** and test with a sample file
3. **Monitor the dashboard** for successful processing
4. **Gradually migrate** from Power Automate flows

The system is designed to be more reliable and provide better visibility than Power Automate while keeping your existing Excel-based review workflows intact.