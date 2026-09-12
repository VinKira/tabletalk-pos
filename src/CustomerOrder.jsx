import React from 'react';
import { useSearchParams } from 'react-router-dom';

export default function CustomerOrder() {
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table') || 'Tidak Diketahui';

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>📲 Menu Self-Order Pelanggan</h1>
      <p style={{ fontSize: '18px', color: '#555' }}>
        Selamat datang! Anda memesan dari <strong>Meja: {tableId}</strong>
      </p>
      <div style={{ marginTop: '30px', padding: '15px', background: '#f0f9ff', borderRadius: '8px' }}>
        <p>Halaman khusus pelanggan berhasil dibuat dan terpisah dari sistem Kasir/Owner! 🎉</p>
      </div>
    </div>
  );
}
