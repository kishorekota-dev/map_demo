# Credentials Directory

**⚠️ IMPORTANT: Never commit credential files to git!**

## Required Files

This directory should contain the following credential files for DialogFlow integration:

### `dialogflow-key.json`
- **Purpose:** Service account key for DialogFlow API authentication
- **How to generate:** Run `../setup-dialogflow-integration.sh` or follow manual steps below
- **Permissions:** Must be readable only by the application (chmod 600)

## Manual Setup

### 1. Create Service Account Key

```bash
# Set your project ID
PROJECT_ID="ai-experimentation-428115"

# Create service account (if not exists)
gcloud iam service-accounts create nlu-service-account \
  --display-name="NLU Service Account" \
  --project=$PROJECT_ID

# Grant DialogFlow permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:nlu-service-account@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/dialogflow.client"

# Generate key file
gcloud iam service-accounts keys create ./dialogflow-key.json \
  --iam-account="nlu-service-account@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project=$PROJECT_ID

# Secure the file
chmod 600 ./dialogflow-key.json
```

### 2. Verify File Structure

The `dialogflow-key.json` should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Security Best Practices

1. ✅ **Never commit** credential files to version control
2. ✅ **Use environment variables** in production (`GOOGLE_APPLICATION_CREDENTIALS`)
3. ✅ **Rotate keys** regularly (every 90 days recommended)
4. ✅ **Use least privilege** - grant only necessary permissions
5. ✅ **Secure file permissions** - use `chmod 600` for credential files
6. ✅ **Monitor usage** - check GCP audit logs for unauthorized access

## Environment Variables

In your `.env.development` or `.env.production`:

```bash
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/dialogflow-key.json
```

## Troubleshooting

### "Credentials file not found"
- Ensure the file exists in this directory
- Check file permissions (should be readable by the application)
- Verify the path in environment variables

### "Permission denied" errors
- Check service account has `dialogflow.client` or `dialogflow.admin` role
- Verify the service account key is valid and not expired
- Ensure DialogFlow API is enabled in your GCP project

### "Invalid credentials" errors
- Verify the JSON file is valid (not corrupted)
- Check the project ID matches your DialogFlow project
- Regenerate the key if necessary

## For CI/CD

For automated deployments, use GCP Workload Identity or store credentials securely in:
- **GitHub:** Use encrypted secrets
- **GitLab:** Use CI/CD variables (masked and protected)
- **Jenkins:** Use credentials plugin
- **Kubernetes:** Use secrets or Workload Identity

Never store credentials in plaintext in CI/CD pipelines!
