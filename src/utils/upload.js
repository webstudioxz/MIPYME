// ============================================
// UPLOAD.JS - Subida de imágenes a Supabase Storage
// ============================================
import { supabase } from '../config/supabase.js';

const BUCKET = process.env.SUPABASE_BUCKET || 'productos';

export async function uploadToSupabase(file, folder = 'Productos') {
    if (!file) return null;

    try {
        const ext = file.originalname.split('.').pop().toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${safeExt}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('❌ Error subiendo a Supabase Storage:', uploadError.message);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(fileName);

        if (!urlData?.publicUrl) {
            console.error('❌ No se pudo obtener URL pública');
            return null;
        }

        console.log('✅ Imagen subida:', urlData.publicUrl);
        return urlData.publicUrl;
    } catch (e) {
        console.error('❌ Error en uploadToSupabase:', e);
        return null;
    }
}

export async function deleteFromSupabase(imageUrl) {
    if (!imageUrl) return false;

    try {
        const urlObj = new URL(imageUrl);
        const pathParts = urlObj.pathname.split('/');

        const publicIdx = pathParts.indexOf('public');
        if (publicIdx === -1 || publicIdx + 1 >= pathParts.length) {
            console.warn('⚠️ URL no parece de Supabase Storage:', imageUrl);
            return false;
        }

        const bucket = pathParts[publicIdx + 1];
        const filePath = pathParts.slice(publicIdx + 2).join('/');

        if (!filePath) {
            console.warn('⚠️ No se pudo extraer el path del archivo');
            return false;
        }

        const { error } = await supabase.storage
            .from(bucket)
            .remove([filePath]);

        if (error) {
            console.error('❌ Error eliminando de Supabase Storage:', error.message);
            return false;
        }

        console.log('🗑️ Imagen eliminada:', filePath);
        return true;
    } catch (e) {
        console.error('❌ Error en deleteFromSupabase:', e);
        return false;
    }
}