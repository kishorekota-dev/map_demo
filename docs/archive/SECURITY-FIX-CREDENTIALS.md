# Security Fix: DialogFlow Credentials Removal

## Issue
On October 20, 2025, GitHub Push Protection blocked a push that contained Google Cloud Service Account credentials (`dialogflow-key.json`).

## Resolution Applied

### 1. ✅ Removed Credentials from Git
- Used `git rm --cached` to remove the file from tracking
- Used `git filter-branch` to remove it from entire git history
- Force pushed cleaned history to GitHub

### 2. ✅ Updated .gitignore
Added comprehensive patterns to prevent future credential commits:

```gitignore
# Credentials and secrets
**/credentials/
**/*-key.json
**/dialogflow-key.json
**/service-account*.json
**/.env.local
**/.env.*.local
```

### 3. ✅ Created Service-Specific .gitignore
Created `/poc-nlu-service/.gitignore` with:
- credentials/
- *-key.json
- service-account*.json
- All secret file patterns

### 4. ✅ Added Credentials Setup Documentation
Created `/poc-nlu-service/credentials/README.md` with:
- How to generate service account keys
- Security best practices
- Environment variable setup
- Troubleshooting guide

## Current Status
- ✅ All credentials removed from git history
- ✅ Push protection requirements satisfied
- ✅ Code successfully pushed to GitHub
- ✅ .gitignore configured to prevent future issues
- ✅ Documentation added for team members

## How to Regenerate Credentials

If you cloned the repository and need the credentials:

```bash
cd /Users/container/git/map_demo/poc-nlu-service

# Run the setup script (recommended)
./setup-dialogflow-integration.sh

# OR generate manually
PROJECT_ID="ai-experimentation-428115"
gcloud iam service-accounts keys create credentials/dialogflow-key.json \
  --iam-account="nlu-service-account@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project=$PROJECT_ID

chmod 600 credentials/dialogflow-key.json
```

## Security Best Practices Going Forward

### ✅ DO:
1. Keep credentials in `credentials/` directory (gitignored)
2. Use environment variables for configuration
3. Rotate service account keys every 90 days
4. Use least-privilege IAM roles
5. Review `.gitignore` before committing

### ❌ DON'T:
1. Commit any files ending in `-key.json`
2. Commit service account JSON files
3. Commit `.env` files with secrets
4. Share credentials via chat or email
5. Use production credentials in development

## Files Affected by This Fix

### Modified:
- `.gitignore` - Added credential patterns
- Git history - Removed credential file from all commits

### Added:
- `poc-nlu-service/.gitignore` - Service-specific ignore rules
- `poc-nlu-service/credentials/README.md` - Setup instructions

### Deleted:
- `poc-nlu-service/credentials/dialogflow-key.json` - From git only (file still exists locally)

## Verification

To verify credentials are not in repository:

```bash
# Search for credential files in git
git ls-files | grep -i "key.json"
# Should return nothing

# Check gitignore is working
echo "test" > poc-nlu-service/credentials/test-key.json
git status
# Should show file as ignored
rm poc-nlu-service/credentials/test-key.json
```

## Additional Security Measures

### For CI/CD:
- Use GitHub Secrets for credentials
- Never log credential values
- Use GCP Workload Identity when possible

### For Local Development:
- Keep credentials outside repository root
- Use `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- Consider using `gcloud auth application-default login` for local development

### For Production:
- Use GCP service account impersonation
- Enable audit logging
- Implement credential rotation
- Use Secret Manager for sensitive data

## Incident Timeline

1. **Initial Commit**: DialogFlow credentials accidentally committed
2. **Push Blocked**: GitHub Push Protection detected secret
3. **Investigation**: Identified `poc-nlu-service/credentials/dialogflow-key.json`
4. **Remediation**: 
   - Removed from git cache
   - Updated .gitignore
   - Cleaned git history
   - Added documentation
5. **Resolution**: Successfully pushed cleaned repository

## Lessons Learned

1. Always add credentials directory to `.gitignore` before creating files
2. Review `git status` carefully before committing
3. Use pre-commit hooks to scan for secrets
4. Test `.gitignore` patterns before adding sensitive files

## References

- [GitHub Push Protection Documentation](https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection)
- [GCP Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
- [Git Filter-Branch Documentation](https://git-scm.com/docs/git-filter-branch)

---

**Status**: ✅ RESOLVED  
**Date**: October 20, 2025  
**Resolved By**: Automated security fix  
**Next Review**: 90 days (credential rotation)
