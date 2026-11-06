import { supabase } from '../config/supabase.js';

const DEFAULT_BUCKET = process.env.SUPABASE_BUCKET || 'Productos';

/**
 * Sube una imagen a Supabase Storage
 * @param {Object} file - File object de multer (con buffer, originalname, mimetype)
 * @param {string} folder - Bucket + subcarpeta (por defecto 'Productos')
 * @returns {Promise<string|null>} - URL pública de la imagen o null si falla
 */
export async function uploadToSupabase(file, folder = DEFAULT_BUCKET) {
    try {
        if (!file) return null;

        const fileExt = (file.originalname || 'img.jpg').split('.').pop().toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt) ? fileExt : 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${safeExt}`;
        const filePath = `${folder}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(folder)
            .upload(filePath, file.buffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.mimetype || `image/${safeExt}`
            });

        if (uploadError) {
            console.error('❌ Error en upload:', uploadError.message);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from(folder)
            .getPublicUrl(filePath);

        if (!urlData?.publicUrl) {
            console.error('❌ No se pudo obtener URL pública');
            return null;
        }

        return urlData.publicUrl;
    } catch (error) {
        console.error('❌ Error subiendo imagen:', error);
        return null;
    }
}

/**
 * Elimina una imagen de Supabase Storage por su URL pública
 * @param {string} imageUrl - URL pública de la imagen
 * @returns {Promise<boolean>} - true si se eliminó, false si falló
 */
export async function deleteFromSupabase(imageUrl) {
    try {
        if (!imageUrl || !imageUrl.includes('/storage/v1/object/public/')) return false;

        // Extraer bucket y path del archivo de la URL
        // URL típica: https://xxx.supabase.co/storage/v1/object/public/<bucket>/<path>
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

        return true;
    } catch (error) {
        console.error('❌ Error eliminando imagen:', error);
        return false;
    }
}
