import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { InMemSupabaseMock } from './supabase_mock';

let instance: SupabaseClient | null = null;
const globalMock = new InMemSupabaseMock();

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function getSupabaseClient(): SupabaseClient {
  if (instance) {
    return instance;
  }

  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      '[SUPABASE FAIL-CLOSED] Cannot initialize Supabase client: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  const isMock =
    process.env.MOCK_SUPABASE === 'true' ||
    config.url.includes('sandbox') ||
    config.url.includes('mock') ||
    config.url.includes('localhost');

  if (isMock) {
    instance = globalMock as unknown as SupabaseClient;
    return instance;
  }

  instance = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return instance;
}

export function resetSupabaseClientInstance(): void {
  instance = null;
}

export function resetSupabaseMockData(): void {
  globalMock.reset();
}

