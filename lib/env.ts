// Environment variable validation
// Ensures required environment variables are set before the app starts

// Note: DATABASE_URL is no longer required; we use separate SV/RSR database configs
// (SV_CLOUD_SQL_CONNECTION_NAME / RSR_CLOUD_SQL_CONNECTION_NAME at runtime)
const requiredEnvVars = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
] as const;

export function validateEnv() {
  // Skip validation during Next.js build phase — secrets are injected at runtime
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
      `Please set these variables in your environment or Secret Manager.`
    );
  }
}

// Validate immediately when this module is imported
validateEnv();

// Export typed environment variables
export const env = {
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

