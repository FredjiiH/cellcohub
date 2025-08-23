# Security Guidelines

## 🚨 CRITICAL: Never Expose Credentials

### What NOT to commit:
- `.env` files
- API keys, tokens, passwords
- Database connection strings
- Azure AD client secrets
- MongoDB credentials
- Any file containing sensitive data

### Prevention Measures:

#### 1. Use Environment Variables
✅ **Correct**:
```env
# In .env file (never committed)
AZURE_CLIENT_SECRET=your_secret_here
```

```javascript
// In code
const secret = process.env.AZURE_CLIENT_SECRET;
```

❌ **NEVER DO**:
```javascript
// Hardcoded in source code
const secret = "213c576b-54ff-4438-8aa2-e2340a566b58y";
```

#### 2. Use Placeholder Examples
✅ **Correct documentation**:
```env
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_secret_here
```

❌ **NEVER DO**:
```env
AZURE_CLIENT_ID=161407e5-d9c8-47f0-b8d2-a96648337b0c
AZURE_CLIENT_SECRET=213c576b-54ff-4438-8aa2-e2340a566b58y
```

## Security Checklist

### Before Every Commit:
- [ ] Check for hardcoded credentials
- [ ] Verify `.env` files are in `.gitignore`
- [ ] Review documentation for exposed secrets
- [ ] Use placeholder values in examples

### Regular Security Tasks:
- [ ] Rotate API keys and secrets regularly
- [ ] Review repository for accidentally committed secrets
- [ ] Ensure team members understand security practices
- [ ] Use secret scanning tools when available

## If Credentials Are Exposed:

### Immediate Actions:
1. **Rotate the credentials immediately**
   - Azure AD: Generate new client secret
   - MongoDB: Update connection credentials
   - Any other exposed keys

2. **Remove from Git history** (if committed)
   ```bash
   # WARNING: This rewrites git history
   git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch filename' --prune-empty --tag-name-filter cat -- --all
   ```

3. **Update all environments** with new credentials

### Prevention for Next Time:
1. Use `.env.example` with placeholder values
2. Add pre-commit hooks to scan for secrets
3. Regular security reviews of documentation
4. Team training on security practices

## Environment File Structure

Create `.env.example` with safe placeholder values:
```env
# Azure AD Configuration
AZURE_CLIENT_ID=your_client_id_here
AZURE_TENANT_ID=your_tenant_id_here  
AZURE_CLIENT_SECRET=your_client_secret_here

# Database Configuration
MONGODB_URI=your_mongodb_connection_string_here

# Application Configuration
PORT=4000
NODE_ENV=development
```

Then each developer copies this to `.env` and fills in real values.

## Contact

If you discover exposed credentials:
1. Immediately notify the team
2. Follow the credential rotation process above
3. Document the incident for learning

**Remember: Security is everyone's responsibility!**