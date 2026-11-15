// ============================================================
// src/utils/upload.js — Subida/eliminación de imágenes en Supabase Storage
// ============================================================

import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

const BUCKET = 'Productos';

/**
 * Sube un archivo al bucket de Supabase.
 * Devuelve URL pública o null si falla.
 */
export async function uploadToSupabase(file, folder = BUCKET) {
    try {
        if (!file || !file.buffer) return null;

        const fileExt = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(fileExt) ? fileExt : 'jpg';
        const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${safeExt}`;

        const { error } = await supabase.storage
            .from(folder)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.error('❌ [upload] Supabase error:', error.message);
            return null;
        }

        const { data } = supabase.storage.from(folder).getPublicUrl(fileName);
        return data?.publicUrl || null;
    } catch (error) {
        console.error('❌ [upload] Error:', error.message);
        return null;
    }
}

/**
 * Elimina una imagen del bucket a partir de su URL pública.
 * Solo actúa si la URL pertenece al bucket "Productos".
 */
export async function deleteFromSupabase(imageUrl) {
    try {
        if (!imageUrl || typeof imageUrl !== 'string') return false;
        if (!imageUrl.includes(`/${BUCKET}/`)) return false;

        const fileName = imageUrl.split(`/${BUCKET}/`)[1]?.split('?')[0];
        if (!fileName) return false;

        const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
        if (error) {
            console.error('❌ [delete] Supabase error:', error.message);
            return false;
        }
        return true;
    } catch (error) {
        console.error('❌ [delete] Error:', error.message);
        return false;
    }
}