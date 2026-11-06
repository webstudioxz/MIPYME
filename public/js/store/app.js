// ============================================
// STORE APP - Controlador principal de la tienda
// ============================================
window.StoreApp = {
    currentStore: null,
    allProducts: [],

    async init() {
        console.log('🚀 Iniciando StoreApp...');
        
        try {
            // 1. Detectar tienda (por URL o cargar la primera de la BD)
            const urlParams = new URLSearchParams(window.location.search);
            this.currentStore = urlParams.get('tienda');
            
            if (!this.currentStore) {
                const resStores = await fetch('/api/tiendas/info');
                const stores = await resStores.json();
                if (stores && stores.length > 0) {
                    this.currentStore = stores[0].id;
                } else {
                    return this.showError('No hay tiendas creadas en el sistema.');
                }
            }

            // 2. Cargar datos de la tienda
            const resStore = await fetch(`/api/tiendas/${this.currentStore}`);
            const storeInfo = await resStore.json();
            
            if (storeInfo && storeInfo.nombre) {
                document.getElementById('headerStoreName').innerText = storeInfo.nombre;
                document.getElementById('heroTitle').innerText = storeInfo.nombre;
                if(storeInfo.descripcion) {
                    document.getElementById('heroDescription').innerText = storeInfo.descripcion;
                }
                document.title = `${storeInfo.nombre} - Tienda-fg`;
            }

            // 3. Cargar productos
            const resProducts = await fetch(`/api/productos?tienda=${this.currentStore}`);
            const products = await resProducts.json();
            
            this.allProducts = Array.isArray(products) ? products : [];
            
            // 4. Renderizar y ocultar el loader
            this.renderProducts(this.allProducts);
            document.getElementById('globalLoader').classList.add('hidden');

        } catch (error) {
            console.error('❌ Error cargando la tienda:', error);
            this.showError('Error de conexión con el servidor.');
        }
    },

    renderProducts(products) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) skeleton.style.display = 'none';

        if (!products || products.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#6B7A99;"><i class="fas fa-box-open" style="font-size:3rem;margin-bottom:10px;"></i><br>Esta tienda no tiene productos aún.</div>';
            return;
        }

        let html = '<div class="grid-productos">';
        
        products.forEach(p => {
            const disponible = p.disponible === true || p.disponible === 'true';
            const desc = p.descuento || 0;
            const precioFinal = p.precio * (1 - desc / 100);
            const img = p.imagen || 'https://via.placeholder.com/400x400?text=Sin+Imagen';
            
            html += `
            <article class="producto-card">
                <div class="card-img-wrapper">
                    ${desc > 0 ? `<span class="availability-badge badge-offer"><i class="fas fa-tag"></i> Oferta</span>` : ''}
                    ${disponible && desc === 0 ? `<span class="availability-badge"><i class="fas fa-circle-check"></i> Disponible</span>` : ''}
                    ${!disponible ? `<span class="availability-badge" style="background:#FEE2E2; color:#EF4444;"><i class="fas fa-ban"></i> Agotado</span>` : ''}
                    <button class="card-wishlist"><i class="fas fa-heart"></i></button>
                    <img src="${img}" alt="${p.nombre}" loading="lazy">
                </div>
                <div class="card-body">
                    <span class="card-category">${p.categoria || 'General'}</span>
                    <h3 class="card-title">${p.nombre}</h3>
                    <div class="card-rating"><span class="stars">★★★★★</span><span>4.8 · 124 reseñas</span></div>
                    <div class="price-box">
                        ${desc > 0 ? `<span class="old-price">${p.precio} CUP</span>` : ''}
                        <span class="new-price">${precioFinal.toFixed(0)} CUP</span>
                    </div>
                    <div class="card-footer">
                        <div class="qty-control">
                            <button class="qty-btn">−</button>
                            <span class="qty-val">1</span>
                            <button class="qty-btn">+</button>
                        </div>
                        <button class="btn-add" ${!disponible ? 'disabled' : ''}><i class="fas fa-cart-plus"></i> Añadir</button>
                    </div>
                </div>
            </article>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    },

    showError(msg) {
        document.getElementById('globalLoader').classList.add('hidden');
        document.getElementById('dynamicContent').innerHTML = `
            <div style="text-align:center; padding: 40px; color: #EF4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>${msg}</h3>
            </div>`;
    }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => StoreApp.init());