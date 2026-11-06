import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env');
    process.exit(1);
}

// Cliente de Supabase con privilegios de administrador (Solo para el Backend)
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 👇 AGREGA ESTAS LÍNEAS AL FINAL 👇
export function handleSupabaseError(error, context = '') {
    if (error) {
        console.error(`❌ Supabase Error [${context}]:`, error.message);
        return true;
    }
    return false;
}