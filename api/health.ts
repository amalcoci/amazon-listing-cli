import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  return res.status(200).json({
    status: 'healthy',
    service: 'Amazon Listing CLI API',
    timestamp: new Date().toISOString(),
    env: {
      hasAmazonCredentials: !!(
        process.env.AMAZON_CLIENT_ID &&
        process.env.AMAZON_CLIENT_SECRET &&
        process.env.AMAZON_REFRESH_TOKEN
      ),
      hasVercelBlob: !!process.env.VERCEL_BLOB_TOKEN,
      region: process.env.AMAZON_REGION,
      sandbox: process.env.AMAZON_SANDBOX,
    },
  });
}
