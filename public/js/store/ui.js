toggleBankInfo() {
    const metodo = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    const bankBox = document.getElementById('bankInfoBox');
    const noCardWarning = document.getElementById('noCardWarning');

    if (metodo === 'Transferencia') {
        // ✅ FIX: leer desde datos_bancarios (así lo guarda el admin)
        const cardNumber = this.storeConfig?.datos_bancarios?.numero_tarjeta;
        const whatsappConf = this.storeConfig?.datos_bancarios?.whatsapp_confirmacion;

        if (cardNumber) {
            if (bankBox) {
                bankBox.classList.add('visible');
                const cardEl = document.getElementById('bankCardNumber');
                if (cardEl) cardEl.textContent = cardNumber;
            }
            const waLink = document.getElementById('whatsappBankLink');
            if (waLink && whatsappConf) {
                const phone = whatsappConf.replace(/[^0-9]/g, '');
                waLink.href = `https://wa.me/${phone}?text=${encodeURIComponent('Hola, envío comprobante de transferencia para mi pedido.')}`;
            }
            if (noCardWarning) noCardWarning.style.display = 'none';
        } else {
            if (bankBox) bankBox.classList.remove('visible');
            if (noCardWarning) noCardWarning.style.display = 'block';
        }
    } else {
        if (bankBox) bankBox.classList.remove('visible');
        if (noCardWarning) noCardWarning.style.display = 'none';
    }
},