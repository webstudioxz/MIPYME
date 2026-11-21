// ============================================================
// src/utils/upload.js — Corregido y Optimizado
// Maneja la subida y eliminación de imágenes en Supabase Storage
// ============================================================

import { supabase } from '../config/supabase.js';

// 🚨 IMPORTANTE: Si tu Bucket en Supabase Storage tiene otro nombre, 
// cámbialo aquí (ej: 'productos', 'imagenes', 'tienda-fg', etc.)
const BUCKET_NAME = 'Productos';

/**
 * Sube un archivo a Supabase Storage
 * @param {Object} file - El archivo recibido por Multer (req.file)
 * @param {String} folder - Carpeta opcional dentro del bucket
 * @returns {String|null} - URL pública de la imagen o null si falla
 */
export async function uploadToSupabase(file, folder = BUCKET_NAME) {
    try {
        if (!file) {
            console.warn('⚠️ [Upload] No se recibió ningún archivo.');
            return null;
        }

        // 1. Obtener la extensión del archivo original (jpg, png, webp, etc.)
        const originalName = file.originalname || 'imagen.jpg';
        const fileExt = originalName.split('.').pop().toLowerCase();
        
        // 2. Generar un nombre único usando el tiempo y un número aleatorio
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

        // 3. Subir a Supabase Storage
        const { data, error } = await supabase.storage
            .from(folder)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false // Evita sobreescribir archivos con el mismo nombre
            });

        if (error) {
            console.error('❌ [Upload] Error al subir a Supabase:', error.message);
            return null;
        }

        // 4. Obtener la URL pública
        const { data: urlData } = supabase.storage
            .from(folder)
            .getPublicUrl(fileName);

        if (!urlData || !urlData.publicUrl) {
            console.error('❌ [Upload] No se pudo generar la URL pública');
            return null;
        }

        console.log('✅ [Upload] Imagen subida exitosamente:', urlData.publicUrl);
        return urlData.publicUrl;

    } catch (error) {
        console.error('❌ [Upload] Error crítico:', error.message);
        return null;
    }
}

/**
 * Elimina una imagen de Supabase Storage basándose en su URL pública
 * @param {String} imageUrl - La URL completa de la imagen guardada en la BD
 * @returns {Boolean} - true si se eliminó, false si falló o no era válida
 */
export async function deleteFromSupabase(imageUrl) {
    try {
        if (!imageUrl) return false;
        
        // Si la URL no pertenece a nuestro bucket, no intentamos borrarla 
        // (ej: es un placeholder de internet)
        if (!imageUrl.includes(`/${BUCKET_NAME}/`)) {
            return false;
        }

        // Extraer solo el nombre del archivo de la URL
        // Ejemplo: https://xxx.supabase.co/storage/v1/object/public/Productos/12345-abc.jpg
        // Resultado: 12345-abc.jpg
        const urlParts = imageUrl.split(`/${BUCKET_NAME}/`);
        if (urlParts.length < 2) return false;
        
        const fileName = urlParts[1];

        // Eliminar de Supabase Storage
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([fileName]);

        if (error) {
            console.error('❌ [Upload] Error al eliminar imagen:', error.message);
            return false;
        }

        console.log('✅ [Upload] Imagen eliminada:', fileName);
        return true;

    } catch (error) {
        console.error('❌ [Upload] Error crítico al eliminar:', error.message);
        return false;
    }
}