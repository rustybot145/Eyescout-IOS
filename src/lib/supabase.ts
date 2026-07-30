import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Same public/anon-equivalent key already used client-side on the web portal —
// safe to embed. The service-role secret in .env is NEVER used in app code.
const SUPABASE_URL = 'https://auvnwuliwghmjbhhovbo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7qKzHagsIYotquLIiARBqg_cbTSv9C5';

// expo-secure-store caps each value at ~2048 bytes, and a Supabase session
// (access + refresh JWT) can exceed that. This adapter transparently chunks
// large values across multiple SecureStore entries. Auth token stays in the
// device keychain (encrypted) rather than plain AsyncStorage — this app holds
// minors' PII, so keychain storage is the deliberate choice.
const CHUNK_SIZE = 1800;
const META_PREFIX = '__chunks__:';

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith(META_PREFIX)) return head;
    const count = parseInt(head.slice(META_PREFIX.length), 10);
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(key, `${META_PREFIX}${count}`);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },
  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    if (head && head.startsWith(META_PREFIX)) {
      const count = parseInt(head.slice(META_PREFIX.length), 10);
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}__${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
