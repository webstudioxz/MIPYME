import { supabase } from '../config/supabase.js';

export async function uploadToSupabase(file, folder = 'Productos') {
    try {
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error } = await supabase.storage.from(folder).upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) return null;
        const { data: { publicUrl } } = supabase.storage.from(folder).getPublicUrl(fileName);
        return publicUrl;
    } catch (error) { return null; }
}

export async function deleteFromSupabase(imageUrl) {
    try {
        if (!imageUrl || !imageUrl.includes('/Productos/')) return false;
        const fileName = imageUrl.split('/Productos/')[1];
        await supabase.storage.from('Productos').remove([fileName]);
        return true;
    } catch (error) { return false; }
}