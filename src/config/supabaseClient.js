// ============================================================
// src/config/supabaseClient.js
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabaseAdmin = createClient(
    env.supabaseUrl,
    env.supabaseServiceKey
);