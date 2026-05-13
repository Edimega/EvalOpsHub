import { and, desc, eq, isNull } from "drizzle-orm";
import { db, providerKeys } from "@evalops/db";
import { decryptSecret, encryptSecret } from "./crypto";

export type ProviderKeyInput = {
  workspaceId: string;
  provider: "openrouter";
  name: string;
  apiKey: string;
  baseUrl: string;
};

export const createProviderKey = async (input: ProviderKeyInput) => {
  await db
    .update(providerKeys)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(providerKeys.workspaceId, input.workspaceId),
      eq(providerKeys.provider, input.provider),
      isNull(providerKeys.revokedAt)
    ));

  const [key] = await db.insert(providerKeys).values({
    workspaceId: input.workspaceId,
    provider: input.provider,
    name: input.name,
    keyPreview: previewSecret(input.apiKey),
    encryptedKey: encryptSecret(input.apiKey),
    baseUrl: input.baseUrl
  }).returning({
    id: providerKeys.id,
    workspaceId: providerKeys.workspaceId,
    provider: providerKeys.provider,
    name: providerKeys.name,
    keyPreview: providerKeys.keyPreview,
    baseUrl: providerKeys.baseUrl,
    createdAt: providerKeys.createdAt
  });

  if (!key) throw new Error("Provider key could not be stored");
  return key;
};

export const listProviderKeys = async (workspaceId: string) =>
  db.select({
    id: providerKeys.id,
    provider: providerKeys.provider,
    name: providerKeys.name,
    keyPreview: providerKeys.keyPreview,
    baseUrl: providerKeys.baseUrl,
    lastUsedAt: providerKeys.lastUsedAt,
    createdAt: providerKeys.createdAt
  })
    .from(providerKeys)
    .where(and(eq(providerKeys.workspaceId, workspaceId), isNull(providerKeys.revokedAt)))
    .orderBy(desc(providerKeys.createdAt));

export const getActiveProviderCredential = async (workspaceId: string, provider: string) => {
  const [key] = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.workspaceId, workspaceId), eq(providerKeys.provider, provider), isNull(providerKeys.revokedAt)))
    .orderBy(desc(providerKeys.createdAt))
    .limit(1);

  if (!key) return null;

  await db.update(providerKeys).set({ lastUsedAt: new Date() }).where(eq(providerKeys.id, key.id));
  return {
    provider: key.provider,
    apiKey: decryptSecret(key.encryptedKey),
    baseUrl: key.baseUrl
  };
};

const previewSecret = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return "••••";
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
};
