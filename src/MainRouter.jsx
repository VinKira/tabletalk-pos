import React from 'react';
import { Routes, Route } from 'react-router-dom';
import App from './App.jsx'; // Mengambil sistem POS kamu tanpa diubah
import CustomerOrder from './CustomerOrder.jsx';

export default function MainRouter() {
  return (
    <Routes>
      {/* Jalur untuk Customer Self-Order */}
      <Route path="/order" element={<CustomerOrder />} />

      {/* Jalur Utama POS (Kasir & Owner) */}
      <Route path="/" element={<App />} />
    </Routes>
  );
}
