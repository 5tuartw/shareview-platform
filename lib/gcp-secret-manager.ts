import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export type AiProvider = 'gemini' | 'openai';

const client = new SecretManagerServiceClient();

export const getGcpProjectId = (): string => {
  const projectId =
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!projectId) {
    throw new Error('GCP project is not configured. Set GCP_PROJECT or GOOGLE_CLOUD_PROJECT.');
  }

  return projectId;
};

export const getDefaultProviderSecretId = (provider: AiProvider): string => {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
};

const ensureSecretExists = async (projectId: string, secretId: string): Promise<string> => {
  const parent = `projects/${projectId}`;
  const secretName = `${parent}/secrets/${secretId}`;

  try {
    await client.getSecret({ name: secretName });
    return secretName;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 5) {
      throw error;
    }

    const [created] = await client.createSecret({
      parent,
      secretId,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });

    if (!created.name) {
      throw new Error(`Failed to create secret ${secretId}.`);
    }

    return created.name;
  }
};

export const addSecretVersion = async ({
  provider,
  apiKey,
  secretId,
}: {
  provider: AiProvider;
  apiKey: string;
  secretId?: string;
}): Promise<{ projectId: string; secretId: string; secretVersionName: string }> => {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error('API key is required.');
  }

  const resolvedSecretId = (secretId || getDefaultProviderSecretId(provider)).trim();
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(resolvedSecretId)) {
    throw new Error('Secret ID must use only letters, numbers, underscores, or dashes.');
  }

  const projectId = getGcpProjectId();
  const secretName = await ensureSecretExists(projectId, resolvedSecretId);

  const [version] = await client.addSecretVersion({
    parent: secretName,
    payload: {
      data: Buffer.from(trimmedApiKey, 'utf8'),
    },
  });

  if (!version.name) {
    throw new Error('Failed to add secret version.');
  }

  return {
    projectId,
    secretId: resolvedSecretId,
    secretVersionName: version.name,
  };
};
