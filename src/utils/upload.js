// ============================================
// UPLOAD.JS - Subida de imágenes a Supabase Storage
// ============================================
import { supabase } from '../config/supabase.js';

const BUCKET = process.env.SUPABASE_BUCKET || 'productos';

/**
 * Sube un archivo a Supabase Storage y retorna la URL pública.
 * @param {Object} file - File object de multer (con buffer, originalname, mimetype)
 * @param {string} folder - Subcarpeta dentro del bucket (ej: 'Productos')
 * @returns {Promise<string|null>} - URL pública de la imagen o null si falla
 */
export async function uploadToSupabase(file, folder = 'Productos') {
    if (!file) return null;

    try {
        // Generar nombre único: carpeta/timestamp-random.ext
        const ext = file.originalname.split('.').pop().toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${safeExt}`;

        // Subir al bucket
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

        // Obtener URL pública
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

/**
 * Elimina una imagen de Supabase Storage por su URL pública.
 * @param {string} imageUrl - URL pública de la imagen
 * @returns {Promise<boolean>} - true si se eliminó, false si falló
 */
export async function deleteFromSupabase(imageUrl) {
    if (!imageUrl) return false;

    try {
        // Extraer el path del archivo de la URL pública
        // URL típica: https://xxx.supabase.co/storage/v1/object/public/productos/Productos/123-abc.jpg
        const urlObj = new URL(imageUrl);
        const pathParts = urlObj.pathname.split('/');

        // Encontrar el bucket y el path del archivo
        // El formato es: /storage/v1/object/public/<bucket>/<path>
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