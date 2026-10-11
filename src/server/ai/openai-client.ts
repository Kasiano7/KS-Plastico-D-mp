import 'server-only';

import OpenAI, { AzureOpenAI } from 'openai';

export type RemoteAiConfig = {
  client: OpenAI;
  defaultModel: string;
  advancedModel: string;
  label: string;
};

/**
 * Construit le client IA uniquement côté serveur.
 * Azure est prioritaire lorsqu'il est entièrement configuré afin de pouvoir
 * héberger le traitement dans la zone choisie par l'entreprise.
 */
export function getRemoteAiConfig(): RemoteAiConfig | null {
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (azureKey && azureEndpoint && azureDeployment && azureApiVersion) {
    return {
      client: new AzureOpenAI({
        apiKey: azureKey,
        endpoint: azureEndpoint,
        deployment: azureDeployment,
        apiVersion: azureApiVersion,
        timeout: 45_000,
        maxRetries: 1,
      }),
      defaultModel: azureDeployment,
      advancedModel: process.env.AZURE_OPENAI_ADVANCED_DEPLOYMENT ?? azureDeployment,
      label: 'Azure OpenAI (serveur sécurisé)',
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

  return {
    client: new OpenAI({ apiKey, baseURL, timeout: 45_000, maxRetries: 1 }),
    defaultModel: process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-5.6-terra',
    advancedModel: process.env.OPENAI_ADVANCED_MODEL ?? 'gpt-5.6-sol',
    label: 'OpenAI API (serveur sécurisé)',
  };
}

export function isRemoteAiConfigured(): boolean {
  return getRemoteAiConfig() !== null;
}
