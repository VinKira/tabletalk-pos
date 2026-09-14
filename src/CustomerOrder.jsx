import React, { useState, useEffect } from 'react';
// Impor logo jika berada di folder src/assets, atau cukup panggil path public seperti di bawah
import tableTalkLogo from '/Logogold-nobg.png'; 

const CustomerOrder = ({ tableNumber, menuList, onPlaceOrder }) => {
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [cart, setCart] = useState([]);

  // Ambil daftar kategori unik
  const categories = ['Semua', ...new Set(menuList.map((item) => item.category))];

  // Filter menu berdasarkan kategori
  const filteredMenu = selectedCategory === 'Semua'
    ? menuList
    : menuList.filter((item) => item.category === selectedCategory);

  return (
    <div className="min-h-screen bg-[#071913] text-amber-50 pb-24">
      {/* 1 & 2. HEADER: Logo di kiri, Info Meja di Ujung Kanan */}
      <header className="flex items-center justify-between p-4 border-b border-amber-900/30">
        <div className="flex items-center gap-3">
          {/* Logo Custom dari Foto 2 */}
          <img 
            src={tableTalkLogo} 
            alt="Table Talk Logo" 
            className="w-12 h-12 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold tracking-wider text-amber-100">Table Talk</h1>
            <p className="text-[10px] tracking-widest text-amber-600 uppercase">
              MAHJONG CAFE & LOUNGE
            </p>
          </div>
        </div>

        {/* Nomor Meja Dipindah ke Ujung Kanan & Teks "MEJA" Dihapus */}
        <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-500/40 px-3 py-1.5 rounded-full text-xs text-amber-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{tableNumber}</span>
        </div>
      </header>

      {/* Tagline */}
      <div className="text-center py-2 text-[10px] tracking-widest text-amber-500/60 uppercase border-b border-amber-900/20">
        GOOD COFFEE • GREAT GAMES • BETTER TALKS
      </div>

      {/* Title Section */}
      <div className="text-center my-6">
        <p className="text-xs text-amber-500 tracking-widest uppercase mb-1">Pilih Menu Favoritmu</p>
        <h2 className="text-2xl font-serif text-amber-100">Menu Table Talk</h2>
      </div>

      {/* 3. BUCKET KATEGORI: Ditambah px-4 agar "Semua" tidak terpotong & tetap scrollable */}
      <div className="flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar border-b border-amber-900/20">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-amber-500 text-amber-950 font-bold shadow-lg shadow-amber-500/20'
                : 'bg-amber-950/30 text-amber-200/70 border border-amber-800/40 hover:border-amber-500/50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 4. GRID MENU & FRAME FOTO 5:4 */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {filteredMenu.map((item) => (
          <div
            key={item.id}
            className="bg-amber-950/20 border border-amber-800/30 rounded-2xl p-3 flex flex-col justify-between"
          >
            <div>
              {/* Container Foto dengan Rasio Presisi 5:4 */}
              <div className="relative w-full aspect-[5/4] rounded-xl overflow-hidden mb-3 bg-black/40 border border-amber-900/30">
                <img
                  src={item.image_url || '/placeholder.png'}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 bg-amber-950/80 border border-amber-600/40 px-2 py-0.5 rounded text-[10px] text-amber-300">
                  {item.category}
                </span>
              </div>

              <h3 className="font-semibold text-sm text-center text-amber-100 mb-1 line-clamp-1">
                {item.name}
              </h3>
              <p className="text-xs text-center text-amber-400 font-medium mb-3">
                Rp {Number(item.price).toLocaleString('id-ID')}
              </p>
            </div>

            <button
              onClick={() => {
                /* Logika tambah ke keranjang kamu */
              }}
              className="w-full py-2 bg-transparent border border-amber-500/60 rounded-xl text-amber-400 text-xs font-medium hover:bg-amber-500 hover:text-amber-950 transition-all"
            >
              + Tambah
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomerOrder;
