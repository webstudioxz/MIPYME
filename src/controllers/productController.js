import { supabase } from '../config/supabase.js';
import { uploadToSupabase, deleteFromSupabase } from '../utils/upload.js';

export const getProducts = async (req, res) => {
    const tienda = req.query.tienda || 'electro';
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('tienda', tienda)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error en /api/productos:', error);
        res.json([]);
    }
};

export const createProduct = async (req, res) => {
    try {
        let imagen = req.body.imagen_url || 'https://via.placeholder.com/400';
        
        if (req.file) {
            const uploadedUrl = await uploadToSupabase(req.file, 'Productos');
            if (uploadedUrl) {
                imagen = uploadedUrl;
            } else {
                return res.status(500).json({ error: 'Error al subir la imagen' });
            }
        }
        
        const productoData = {
            tienda: req.body.tienda,
            nombre: req.body.nombre,
            descripcion: req.body.descripcion || '',
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            imagen: imagen,
            disponible: req.body.disponible === 'true',
            tamanio: req.body.tamanio || 'pequeno',
            categoria: req.body.categoria || 'otros',
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const { data, error } = await supabase
            .from('products')
            .insert(productoData)
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (error) {
        console.error('❌ ERROR al crear producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateProduct = async (req, res) => {
    try {
        const { data: oldProduct } = await supabase
            .from('products')
            .select('imagen')
            .eq('id', req.params.id)
            .single();
        
        const updateData = {
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            disponible: req.body.disponible === 'true',
            tamanio: req.body.tamanio,
            categoria: req.body.categoria,
            updated_at: new Date()
        };
        
        if (req.file) {
            if (oldProduct?.imagen && !oldProduct.imagen.includes('via.placeholder.com')) {
                await deleteFromSupabase(oldProduct.imagen);
            }
            const uploadedUrl = await uploadToSupabase(req.file, 'Productos');
            if (uploadedUrl) updateData.imagen = uploadedUrl;
        } else if (req.body.imagen_url) {
            updateData.imagen = req.body.imagen_url;
        }
        
        const { error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en PUT /api/admin/productos/:id:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const { data: product } = await supabase
            .from('products')
            .select('imagen')
            .eq('id', req.params.id)
            .single();
        
        if (product?.imagen && !product.imagen.includes('via.placeholder.com')) {
            await deleteFromSupabase(product.imagen);
        }
        
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en DELETE /api/admin/productos/:id:', error);
        res.status(500).json({ error: error.message });
    }
};