# Vercel Deployment Guide

This guide walks you through deploying the Amazon Listing CLI to Vercel to securely store environment variables and optionally expose API endpoints.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- Vercel CLI installed globally: `npm install -g vercel`
- All environment variables from your `.env` file

## Quick Start

### 1. Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy to Vercel

From the project root directory:

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account/organization
- Link to existing project? **N** (first time)
- What's your project's name? **amazon-listing-cli** (or keep default)
- In which directory is your code located? **./** (press Enter)
- Want to override settings? **N** (press Enter)

### 4. Set Environment Variables

After the initial deployment, you need to add your environment variables. You can do this in two ways:

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to your project on Vercel: https://vercel.com/dashboard
2. Click on your **amazon-listing-cli** project
3. Go to **Settings** → **Environment Variables**
4. Add each variable from your `.env` file:

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `AMAZON_CLIENT_ID` | `amzn1.application-oa2-client.YOUR_CLIENT_ID` | Production |
| `AMAZON_CLIENT_SECRET` | `amzn1.oa2-cs.v1.YOUR_CLIENT_SECRET` | Production |
| `AMAZON_REFRESH_TOKEN` | `Atzr\|YOUR_REFRESH_TOKEN` | Production |
| `AMAZON_REGION` | `us-east-1` | Production |
| `AMAZON_MARKETPLACE_ID` | `ATVPDKIKX0DER` | Production |
| `AMAZON_SELLER_ID` | `YOUR_SELLER_ID` | Production |
| `AMAZON_SANDBOX` | `false` | Production |
| `VERCEL_BLOB_TOKEN` | `vercel_blob_rw_YOUR_TOKEN` | Production |

5. Click **Save** after adding each variable

#### Option B: Via Vercel CLI

```bash
# Set each environment variable
vercel env add AMAZON_CLIENT_ID production
vercel env add AMAZON_CLIENT_SECRET production
vercel env add AMAZON_REFRESH_TOKEN production
vercel env add AMAZON_REGION production
vercel env add AMAZON_MARKETPLACE_ID production
vercel env add AMAZON_SELLER_ID production
vercel env add AMAZON_SANDBOX production
vercel env add VERCEL_BLOB_TOKEN production
```

When prompted, paste the value for each variable.

### 5. Redeploy with Environment Variables

After adding environment variables, redeploy to apply them:

```bash
vercel --prod
```

## Verify Deployment

### Check Health Endpoint

Your deployment includes a health check endpoint to verify environment variables are loaded:

```bash
curl https://your-project-name.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Amazon Listing CLI API",
  "timestamp": "2025-10-10T...",
  "env": {
    "hasAmazonCredentials": true,
    "hasVercelBlob": true,
    "region": "us-east-1",
    "sandbox": "false"
  }
}
```

## Project Structure

```
amazon-listing-cli/
├── vercel.json           # Vercel configuration
├── .vercelignore         # Files to exclude from deployment
├── api/                  # Vercel serverless functions
│   └── health.ts         # Health check endpoint
├── cli/                  # CLI tool (not deployed)
├── api/                  # SP-API integration (shared code)
└── production-listings/  # Listings data (not deployed)
```

## Important Notes

### What Gets Deployed

- The `api/` folder at the root → Serverless functions
- Build output (`dist/`) → Static files
- Configuration files (`vercel.json`)

### What Doesn't Get Deployed (via `.vercelignore`)

- `.env` files (security)
- `node_modules` (rebuilt on Vercel)
- `production-listings/images` (too large, use Vercel Blob)
- Debug and example files

### Environment Variables Security

✅ **Secure**: Environment variables in Vercel are encrypted and never exposed in client-side code
✅ **Safe**: Your `.env` file is gitignored and not deployed
✅ **Accessible**: Variables are available to serverless functions at runtime

### CLI Usage

The CLI tool continues to work locally with your `.env` file:
```bash
npm start -- list --filter "MPA-DTM"
```

Environment variables in Vercel are for API endpoints and future web interfaces.

## Updating Environment Variables

To update an existing environment variable:

1. **Via Dashboard**: Go to Settings → Environment Variables → Edit
2. **Via CLI**:
   ```bash
   vercel env rm AMAZON_SANDBOX production
   vercel env add AMAZON_SANDBOX production
   # Enter new value when prompted
   ```

Then redeploy:
```bash
vercel --prod
```

## Troubleshooting

### Build Fails
```bash
# Check build logs
vercel logs
```

Common issues:
- Missing dependencies: Run `npm install` locally first
- TypeScript errors: Run `npm run build` locally to debug

### Environment Variables Not Working

1. Verify variables are set: `vercel env ls`
2. Check they're assigned to Production environment
3. Redeploy after adding variables: `vercel --prod`
4. Test health endpoint: `curl https://your-url.vercel.app/api/health`

### Health Endpoint Returns 404

- Ensure `api/health.ts` is deployed
- Check Vercel deployment logs
- Verify `vercel.json` configuration is valid

## Next Steps

- [ ] Deploy to Vercel
- [ ] Add all environment variables
- [ ] Test health endpoint
- [ ] Consider adding more API endpoints for listing operations
- [ ] Set up custom domain (optional)

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Environment Variables Guide](https://vercel.com/docs/concepts/projects/environment-variables)
- [Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
