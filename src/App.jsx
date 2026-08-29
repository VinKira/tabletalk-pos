import React, { useState, useEffect } from 'react';

export default function App() {
  // --- Global Fullscreen Fix ---
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    if (root) {
      root.style.width = '100vw';
      root.style.height = '100vh';
      root.style.maxWidth = 'none';
      root.style.margin = '0';
      root.style.padding = '0';
    }
  }, []);

  // --- Auth & PIN Password State ---
  const [userRole, setUserRole] = useState('cashier'); // 'cashier' | 'owner'
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [targetRole, setTargetRole] = useState(null);
  const [pinInput, setPinInput] = useState('');

  const handleRoleChangeRequest = (role) => {
    if (role === userRole) return;
    setTargetRole(role);
    setPinInput('');
    setShowAuthModal(true);
  };

  const handleVerifyPin = (e) => {
    e.preventDefault();
    if (targetRole === 'cashier' && pinInput === '12345') {
      setUserRole('cashier');
      setShowAuthModal(false);
    } else if (targetRole === 'owner' && pinInput === '678910') {
      setUserRole('owner');
      setShowAuthModal(false);
    } else {
      alert('Password / PIN Salah!');
    }
    setPinInput('');
  };

  // --- Dynamic Tables & Menu State ---
  const [tables, setTables] = useState([
    { id: 1, number: 'Meja 01', status: 'available' },
    { id: 2, number: 'Meja 02', status: 'available' },
    { id: 3, number: 'Meja 03', status: 'available' },
    { id: 4, number: 'Meja 04', status: 'available' },
    { id: 5, number: 'Meja 05', status: 'available' },
  ]);

  const [menuList, setMenuList] = useState([
    { id: 101, name: 'Americano', price: 18900, category: 'drink' },
    { id: 102, name: 'Latte', price: 22900, category: 'drink' },
    { id: 103, name: 'Mie Goreng', price: 18900, category: 'food' },
    { id: 104, name: 'Nasi Goreng', price: 24900, category: 'food' },
    { id: 105, name: 'Matcha Latte', price: 22900, category: 'drink' },
  ]);

  // --- Discount Rules State (Owner Mode) ---
  const [discountRules, setDiscountRules] = useState([]);
  const [discountForm, setDiscountForm] = useState({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);

  // Form State untuk Owner (Meja & Menu)
  const [tableForm, setTableForm] = useState({ id: null, number: '' });
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [menuForm, setMenuForm] = useState({ id: null, name: '', price: '', category: 'food' });
  const [isEditingMenu, setIsEditingMenu] = useState(false);

  // --- POS Mode Selection ---
  const [posMode, setPosMode] = useState('dine-in'); // 'dine-in' | 'takeaway'

  // --- Dine-In State ---
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeSessions, setActiveSessions] = useState({});
  const [confirmedOrders, setConfirmedOrders] = useState({});
  const [currentCart, setCurrentCart] = useState({});
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // --- Takeaway State ---
  const [takeawayPlatform, setTakeawayPlatform] = useState('On Site'); // 'On Site', 'GoFood', 'GrabFood', 'ShopeeFood'
  const [takeawayCustomerName, setTakeawayCustomerName] = useState('');
  const [takeawayOrderNoInput, setTakeawayOrderNoInput] = useState('');
  const [autoTakeawayCounter, setAutoTakeawayCounter] = useState(1);
  const [takeawayCart, setTakeawayCart] = useState([]);
  
  // List Antrean Takeaway Active Order
  const [takeawayOrders, setTakeawayOrders] = useState([]);
  const [selectedTakeawayOrder, setSelectedTakeawayOrder] = useState(null);
  const [showTakeawayPaymentModal, setShowTakeawayPaymentModal] = useState(false);

  // --- 1. Manajemen Meja CRUD (Owner) ---
  const handleSaveTable = (e) => {
    e.preventDefault();
    if (!tableForm.number.trim()) return;

    if (isEditingTable) {
      setTables(tables.map(t => t.id === tableForm.id ? { ...t, number: tableForm.number } : t));
      setIsEditingTable(false);
    } else {
      const newId = tables.length ? Math.max(...tables.map(t => t.id)) + 1 : 1;
      setTables([...tables, { id: newId, number: tableForm.number, status: 'available' }]);
    }
    setTableForm({ id: null, number: '' });
  };

  const handleEditTableClick = (t) => {
    setTableForm(t);
    setIsEditingTable(true);
  };

  const handleDeleteTable = (id) => {
    if (confirm('Yakin ingin menghapus meja ini?')) {
      setTables(tables.filter(t => t.id !== id));
      if (selectedTable?.id === id) setSelectedTable(null);
    }
  };

  // --- 2. Manajemen Menu CRUD (Owner) ---
  const handleSaveMenu = (e) => {
    e.preventDefault();
    if (!menuForm.name || !menuForm.price) return alert('Nama dan Harga wajib diisi!');

    if (isEditingMenu) {
      setMenuList(menuList.map(item => item.id === menuForm.id ? { ...menuForm, price: Number(menuForm.price) } : item));
      setIsEditingMenu(false);
    } else {
      const newId = menuList.length ? Math.max(...menuList.map(m => m.id)) + 1 : 101;
      setMenuList([...menuList, { ...menuForm, id: newId, price: Number(menuForm.price) }]);
    }
    setMenuForm({ id: null, name: '', price: '', category: 'food' });
  };

  const handleEditMenuClick = (item) => {
    setMenuForm(item);
    setIsEditingMenu(true);
  };

  const handleDeleteMenu = (id) => {
    if (confirm('Yakin ingin menghapus menu ini?')) {
      setMenuList(menuList.filter(item => item.id !== id));
    }
  };

  // --- 3. Manajemen Promo Diskon CRUD (Owner) ---
  const handleSaveDiscountRule = (e) => {
    e.preventDefault();
    if (!discountForm.menuId) return alert('Pilih menu terlebih dahulu!');

    const targetMenu = menuList.find(m => m.id === Number(discountForm.menuId));
    if (!targetMenu) return;

    const newRule = {
      id: isEditingDiscount ? discountForm.id : Date.now(),
      menuId: Number(discountForm.menuId),
      menuName: targetMenu.name,
      minQty: Number(discountForm.minQty),
      discountAmount: Number(discountForm.discountAmount)
    };

    if (isEditingDiscount) {
      setDiscountRules(discountRules.map(r => r.id === newRule.id ? newRule : r));
      setIsEditingDiscount(false);
    } else {
      setDiscountRules([...discountRules, newRule]);
    }
    setDiscountForm({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  };

  const handleDeleteDiscountRule = (id) => {
    if (confirm('Hapus rule promo ini?')) {
      setDiscountRules(discountRules.filter(r => r.id !== id));
    }
  };

  // --- REVISI 1: Helper Hitung Diskon Otomatis BERLAKU KELIPATAN ---
  const calculateAutoDiscount = (recapList) => {
    let totalDiscount = 0;
    recapList.forEach(item => {
      const matchedRules = discountRules.filter(r => r.menuId === item.id && item.qty >= r.minQty);
      matchedRules.forEach(r => {
        const multiplier = Math.floor(item.qty / r.minQty);
        totalDiscount += multiplier * r.discountAmount;
      });
    });
    return totalDiscount;
  };

  // --- 4. Alur Operasional POS (Dine-In) ---
  const handleSelectTable = (table) => {
    setSelectedTable(table);
  };

  const handleOpenTable = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const newSessionId = crypto.randomUUID();

    setActiveSessions(prev => ({ ...prev, [tableId]: newSessionId }));
    setConfirmedOrders(prev => ({ ...prev, [tableId]: [] }));
    setCurrentCart(prev => ({ ...prev, [tableId]: [] }));

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'occupied' } : t));
    setSelectedTable(prev => ({ ...prev, status: 'occupied' }));
  };

  const handleCancelOpenTable = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    setActiveSessions(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setConfirmedOrders(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'available' } : t));
    setSelectedTable(prev => ({ ...prev, status: 'available' }));
  };

  const handleAddToCart = (menuItem) => {
    if (!selectedTable || selectedTable.status !== 'occupied') return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];

    const existingIndex = cart.findIndex(item => item.id === menuItem.id);
    let updatedCart = [];

    if (existingIndex > -1) {
      updatedCart = cart.map((item, idx) => 
        idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
      );
    } else {
      updatedCart = [...cart, { ...menuItem, qty: 1 }];
    }

    setCurrentCart(prev => ({ ...prev, [tableId]: updatedCart }));
  };

  const handleRemoveFromCart = (itemId) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    setCurrentCart(prev => ({ ...prev, [tableId]: cart.filter(item => item.id !== itemId) }));
  };

  const handleConfirmOrder = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    if (cart.length === 0) return alert('Keranjang pesanan masih kosong!');

    const newBatch = {
      batchId: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'Kasir',
      items: [...cart]
    };

    const existingBatches = confirmedOrders[tableId] || [];
    setConfirmedOrders(prev => ({ ...prev, [tableId]: [...existingBatches, newBatch] }));
    setCurrentCart(prev => ({ ...prev, [tableId]: [] }));

    alert('Order berhasil dikonfirmasi & dikirim ke Printer Dapur!');
  };

  const getTableRecap = (tableId) => {
    const batches = confirmedOrders[tableId] || [];
    const recapMap = {};

    batches.forEach(b => {
      b.items.forEach(it => {
        if (recapMap[it.name]) {
          recapMap[it.name].qty += it.qty;
        } else {
          recapMap[it.name] = { ...it, id: it.id };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const subTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount(recapList);
    return { recapList, subTotal, autoDiscount, batches };
  };

  const handlePaymentSuccess = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    alert('Pembayaran Sukses! Struk Berhasil Dicetak.');

    setActiveSessions(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setConfirmedOrders(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'available' } : t));
    setSelectedTable(prev => ({ ...prev, status: 'available' }));
    setShowCheckoutModal(false);
  };

  // --- 5. Alur Operasional Takeaway ---
  const handleAddToTakeawayCart = (menuItem) => {
    const existingIndex = takeawayCart.findIndex(item => item.id === menuItem.id);
    if (existingIndex > -1) {
      setTakeawayCart(takeawayCart.map((item, idx) => 
        idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setTakeawayCart([...takeawayCart, { ...menuItem, qty: 1 }]);
    }
  };

  const handleRemoveFromTakeawayCart = (itemId) => {
    setTakeawayCart(takeawayCart.filter(item => item.id !== itemId));
  };

  const handleConfirmTakeawayOrder = () => {
    if (takeawayCart.length === 0) return alert('Keranjang Takeaway kosong!');

    let generatedOrderNo = '';
    if (takeawayPlatform === 'On Site') {
      generatedOrderNo = `#${String(autoTakeawayCounter).padStart(3, '0')}`;
      setAutoTakeawayCounter(prev => prev + 1);
    } else {
      if (!takeawayOrderNoInput.trim()) return alert('Masukkan Nomor Orderan Aplikasi terlebih dahulu!');
      generatedOrderNo = `#${takeawayOrderNoInput.trim()}`;
    }

    const subTotal = takeawayCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount(takeawayCart);

    const newTakeawayOrder = {
      id: crypto.randomUUID(),
      orderNo: generatedOrderNo,
      platform: takeawayPlatform,
      customerName: takeawayCustomerName || 'Pelanggan',
      items: [...takeawayCart],
      subTotal,
      discount: autoDiscount,
      total: Math.max(0, subTotal - autoDiscount),
      isPaid: false,
      isCompleted: false,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setTakeawayOrders(prev => [newTakeawayOrder, ...prev]);
    setTakeawayCart([]);
    setTakeawayCustomerName('');
    setTakeawayOrderNoInput('');

    alert(`Order ${generatedOrderNo} Berhasil Dikonfirmasi & Dicetak ke Dapur! Silakan buat orderan berikutnya.`);
  };

  const handlePayTakeaway = (order) => {
    setTakeawayOrders(prev => prev.map(o => o.id === order.id ? { ...o, isPaid: true } : o));
    setShowTakeawayPaymentModal(false);
    alert(`Pembayaran Order ${order.orderNo} Sukses & Struk Dicetak! Status: Menunggu Driver/Pelanggan Mengambil.`);
  };

  const handleCompleteTakeaway = (orderId) => {
    if (confirm('Selesaikan & keluarkan orderan ini dari daftar antrean?')) {
      setTakeawayOrders(prev => prev.filter(o => o.id !== orderId));
    }
  };

  // Calculations Dine-In
  const activeTableId = selectedTable?.id;
  const activeTableStatus = selectedTable?.status;
  const cartItems = activeTableId ? (currentCart[activeTableId] || []) : [];
  const { recapList, subTotal, autoDiscount, batches } = activeTableId ? getTableRecap(activeTableId) : { recapList: [], subTotal: 0, autoDiscount: 0, batches: [] };
  const finalTotal = Math.max(0, subTotal - autoDiscount);

  return (
    <div style={styles.appContainer}>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logoBadge}>TT</div>
          <h1 style={styles.headerTitle}>TableTalk POS</h1>
          
          {userRole === 'cashier' && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
              <button 
                style={posMode === 'dine-in' ? styles.activeModeNavBtn : styles.modeNavBtn} 
                onClick={() => setPosMode('dine-in')}
              >
                🍽️ Dine-In (Meja)
              </button>
              <button 
                style={posMode === 'takeaway' ? styles.activeModeNavBtn : styles.modeNavBtn} 
                onClick={() => setPosMode('takeaway')}
              >
                🛵 Takeaway / Online
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={userRole === 'cashier' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => handleRoleChangeRequest('cashier')}>Kasir Mode</button>
          <button style={userRole === 'owner' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => handleRoleChangeRequest('owner')}>Owner Mode</button>
        </div>
      </header>

      {/* Mode Owner: Kelola Meja, Menu & Promo Diskon */}
      {userRole === 'owner' ? (
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, boxSizing: 'border-box' }}>
          <h2 style={{ marginTop: 0 }}>Panel Owner - Pengaturan Sistem</h2>
          
          {/* 1. Kelola Meja CRUD */}
          <div style={styles.ownerCard}>
            <h3>{isEditingTable ? 'Edit Meja' : 'Tambah Meja Baru'}</h3>
            <form onSubmit={handleSaveTable} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Nama / Nomor Meja (contoh: Meja 06 / VIP 1)" 
                value={tableForm.number} 
                onChange={(e) => setTableForm({ ...tableForm, number: e.target.value })}
                style={styles.inputField}
              />
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingTable ? '#f59e0b' : '#3b82f6' }}>
                {isEditingTable ? 'Simpan Nama Meja' : '+ Tambah Meja'}
              </button>
              {isEditingTable && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingTable(false); setTableForm({ id: null, number: '' }); }}>
                  Batal
                </button>
              )}
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {tables.map(t => (
                <div key={t.id} style={styles.cartRow}>
                  <div style={{ flex: 1 }}><strong>{t.number}</strong></div>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b', marginRight: '4px' }} onClick={() => handleEditTableClick(t)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => handleDeleteTable(t.id)}>Hapus</button>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Kelola Menu CRUD */}
          <div style={styles.ownerCard}>
            <h3>{isEditingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h3>
            <form onSubmit={handleSaveMenu} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Nama Menu" 
                value={menuForm.name} 
                onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                style={styles.inputField}
              />
              <input 
                type="number" 
                placeholder="Harga (Rp)" 
                value={menuForm.price} 
                onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })}
                style={styles.inputField}
              />
              <select 
                value={menuForm.category} 
                onChange={(e) => setMenuForm({ ...menuForm, category: e.target.value })}
                style={styles.inputField}
              >
                <option value="food">Makanan</option>
                <option value="drink">Minuman</option>
              </select>
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingMenu ? '#f59e0b' : '#3b82f6' }}>
                {isEditingMenu ? 'Simpan Menu' : '+ Tambah Menu'}
              </button>
              {isEditingMenu && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingMenu(false); setMenuForm({ id: null, name: '', price: '', category: 'food' }); }}>
                  Batal
                </button>
              )}
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {menuList.map(item => (
                <div key={item.id} style={styles.cartRow}>
                  <div style={{ flex: 1 }}>
                    <strong>{item.name}</strong> - <span style={{ color: '#34d399' }}>Rp {item.price.toLocaleString()}</span> ({item.category})
                  </div>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b', marginRight: '8px' }} onClick={() => handleEditMenuClick(item)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => handleDeleteMenu(item.id)}>Hapus</button>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Kelola Promo Diskon Otomatis */}
          <div style={styles.ownerCard}>
            <h3>Pengaturan Rule Promo Diskon Otomatis</h3>
            <form onSubmit={handleSaveDiscountRule} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <select 
                value={discountForm.menuId} 
                onChange={(e) => setDiscountForm({ ...discountForm, menuId: e.target.value })}
                style={styles.inputField}
              >
                <option value="">-- Pilih Menu Trigger --</option>
                {menuList.map(m => (
                  <option key={m.id} value={m.id}>{m.name} (Rp {m.price.toLocaleString()})</option>
                ))}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>Min Qty:</span>
                <input 
                  type="number" 
                  min="1" 
                  value={discountForm.minQty} 
                  onChange={(e) => setDiscountForm({ ...discountForm, minQty: e.target.value })}
                  style={{ ...styles.inputField, width: '80px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>Potongan (Rp):</span>
                <input 
                  type="number" 
                  placeholder="Nominal Diskon" 
                  value={discountForm.discountAmount} 
                  onChange={(e) => setDiscountForm({ ...discountForm, discountAmount: e.target.value })}
                  style={{ ...styles.inputField, width: '140px' }}
                />
              </div>
              <button type="submit" style={styles.primaryBtn}>+ Simpan Rule Promo</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {discountRules.length === 0 ? (
                <p style={styles.mutedText}>Belum ada rule promo dibuat.</p>
              ) : (
                discountRules.map(r => (
                  <div key={r.id} style={styles.cartRow}>
                    <div style={{ flex: 1 }}>
                      Beli <strong>{r.menuName}</strong> qty min <strong>{r.minQty}x</strong> 👉 Diskon Otomatis <strong>Rp {r.discountAmount.toLocaleString()}</strong> (Berlaku Kelipatan)
                    </div>
                    <button style={styles.deleteBtn} onClick={() => handleDeleteDiscountRule(r.id)}>Hapus</button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      ) : (
        /* Mode Kasir (Dine-In vs Takeaway) */
        <div style={styles.mainLayout}>
          
          {posMode === 'dine-in' ? (
            /* ================= DINE-IN MODE ================= */
            <>
              {/* Panel Kiri: Grid Meja & Menu */}
              <div style={styles.leftPanel}>
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={styles.sectionTitle}>Status Meja</h3>
                  <div style={styles.tableGrid}>
                    {tables.map(t => {
                      const isSelected = selectedTable?.id === t.id;
                      const isOccupied = t.status === 'occupied';
                      return (
                        <div
                          key={t.id}
                          onClick={() => handleSelectTable(t)}
                          style={{
                            ...styles.tableCard,
                            borderColor: isSelected ? '#3b82f6' : isOccupied ? '#ef4444' : '#374151',
                            background: isSelected ? '#1e293b' : '#111827',
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '15px' }}>{t.number}</div>
                          <span style={{
                            ...styles.statusBadge,
                            background: isOccupied ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: isOccupied ? '#f87171' : '#34d399',
                          }}>
                            {isOccupied ? 'Terisi' : 'Kosong'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedTable && (
                  <div>
                    <h3 style={styles.sectionTitle}>Pilih Menu ({selectedTable.number})</h3>
                    {activeTableStatus === 'available' ? (
                      <div style={styles.openTablePromptCard}>
                        <p style={{ margin: '0 0 16px 0', color: '#9ca3af' }}>Meja ini masih dalam keadaan kosong.</p>
                        <button style={styles.primaryBtn} onClick={handleOpenTable}>Open Table</button>
                      </div>
                    ) : (
                      <div style={styles.menuGrid}>
                        {menuList.map(menu => (
                          <div key={menu.id} style={styles.menuCard} onClick={() => handleAddToCart(menu)}>
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
                              <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>Rp {menu.price.toLocaleString()}</div>
                            </div>
                            <button style={styles.addMenuBtn}>+</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Panel Kanan: Billing & Order Summary */}
              <div style={styles.rightPanel}>
                {!selectedTable ? (
                  <div style={styles.emptyStateContainer}>
                    <p>Silakan pilih salah satu meja terlebih dahulu.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={styles.panelHeader}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>{selectedTable.number}</h2>
                        <span style={{ fontSize: '12px', color: activeTableStatus === 'occupied' ? '#34d399' : '#9ca3af' }}>
                          Status: {activeTableStatus === 'occupied' ? 'Sesi Aktif' : 'Kosong'}
                        </span>
                      </div>
                      {activeTableStatus === 'occupied' && batches.length === 0 && cartItems.length === 0 && (
                        <button style={styles.dangerOutlineBtn} onClick={handleCancelOpenTable}>Cancel Open Table</button>
                      )}
                    </div>

                    {activeTableStatus === 'occupied' && (
                      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                        <div style={styles.sectionBlock}>
                          <h4 style={styles.subTitle}>Draft Pesanan Baru</h4>
                          {cartItems.length === 0 ? (
                            <p style={styles.mutedText}>Belum ada menu dipilih</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {cartItems.map(item => (
                                <div key={item.id} style={styles.cartRow}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.name}</div>
                                    <small style={{ color: '#9ca3af' }}>Rp {item.price.toLocaleString()} x {item.qty}</small>
                                  </div>
                                  <div style={{ fontWeight: '600', marginRight: '12px', fontSize: '14px' }}>
                                    Rp {(item.price * item.qty).toLocaleString()}
                                  </div>
                                  <button style={styles.deleteBtn} onClick={() => handleRemoveFromCart(item.id)}>✕</button>
                                </div>
                              ))}
                              <button style={styles.confirmOrderBtn} onClick={handleConfirmOrder}>
                                Confirm Order (Label Dapur)
                              </button>
                            </div>
                          )}
                        </div>

                        <div style={styles.sectionBlock}>
                          <h4 style={styles.subTitle}>Riwayat Order Dapur</h4>
                          {batches.length === 0 ? (
                            <p style={styles.mutedText}>Belum ada orderan dikirim ke dapur</p>
                          ) : (
                            batches.map((b, i) => (
                              <div key={b.batchId} style={styles.batchCard}>
                                <div style={styles.batchHeader}>
                                  <span>Batch #{i + 1} - Jam {b.time}</span>
                                  <span style={styles.badgeSent}>Terkirim Dapur</span>
                                </div>
                                {b.items.map((it, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                                    <span>{it.qty}x {it.name}</span>
                                    <span style={{ color: '#9ca3af' }}>Rp {(it.price * it.qty).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeTableStatus === 'occupied' && (
                      <div style={styles.paymentFooter}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#9ca3af', fontSize: '13px' }}>Subtotal:</span>
                          <span>Rp {subTotal.toLocaleString()}</span>
                        </div>
                        {autoDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#ef4444', fontSize: '13px' }}>
                            <span>Promo Diskon (Otomatis):</span>
                            <span>- Rp {autoDiscount.toLocaleString()}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ color: '#9ca3af' }}>Total Akhir:</span>
                          <span style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>
                            Rp {finalTotal.toLocaleString()}
                          </span>
                        </div>
                        <button 
                          style={{ ...styles.primaryBtn, width: '100%', padding: '12px', fontSize: '14px' }}
                          onClick={() => setShowCheckoutModal(true)}
                          disabled={batches.length === 0}
                        >
                          Close Table & Payment
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ================= TAKEAWAY MODE ================= */
            <>
              {/* Panel Kiri: Input Form Takeaway & Catalog Menu */}
              <div style={styles.leftPanel}>
                <h3 style={styles.sectionTitle}>Pesan Takeaway / Online Order</h3>
                
                {/* Platform Selector */}
                <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
                  {['On Site', 'GoFood', 'GrabFood', 'ShopeeFood'].map(plat => (
                    <button
                      key={plat}
                      onClick={() => setTakeawayPlatform(plat)}
                      style={{
                        ...styles.roleBtn,
                        background: takeawayPlatform === plat ? '#3b82f6' : '#1e293b',
                        color: takeawayPlatform === plat ? '#fff' : '#94a3b8',
                        fontWeight: '600'
                      }}
                    >
                      {plat}
                    </button>
                  ))}
                </div>

                {/* Input No Order / Nama */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  {takeawayPlatform === 'On Site' ? (
                    <input 
                      type="text" 
                      placeholder="Nama Pelanggan (opsional)" 
                      value={takeawayCustomerName} 
                      onChange={(e) => setTakeawayCustomerName(e.target.value)}
                      style={styles.inputField}
                    />
                  ) : (
                    <input 
                      type="text" 
                      placeholder={`Nomor Orderan ${takeawayPlatform} (Wajib)`} 
                      value={takeawayOrderNoInput} 
                      onChange={(e) => setTakeawayOrderNoInput(e.target.value)}
                      style={styles.inputField}
                    />
                  )}
                </div>

                {/* Menu Grid */}
                <div style={styles.menuGrid}>
                  {menuList.map(menu => (
                    <div key={menu.id} style={styles.menuCard} onClick={() => handleAddToTakeawayCart(menu)}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
                        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>Rp {menu.price.toLocaleString()}</div>
                      </div>
                      <button style={styles.addMenuBtn}>+</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel Tengah: Draft Cart Takeaway */}
              <div style={{ flex: 1.2, padding: '20px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                <h3 style={styles.sectionTitle}>Draft Cart Takeaway ({takeawayPlatform})</h3>
                <div style={{ flex: 1, overflowY: 'auto', marginTop: '12px' }}>
                  {takeawayCart.length === 0 ? (
                    <p style={styles.mutedText}>Pilih menu untuk takeaway</p>
                  ) : (
                    takeawayCart.map(item => (
                      <div key={item.id} style={{ ...styles.cartRow, marginBottom: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.name}</div>
                          <small style={{ color: '#9ca3af' }}>Rp {item.price.toLocaleString()} x {item.qty}</small>
                        </div>
                        <div style={{ fontWeight: '600', marginRight: '12px' }}>Rp {(item.price * item.qty).toLocaleString()}</div>
                        <button style={styles.deleteBtn} onClick={() => handleRemoveFromTakeawayCart(item.id)}>✕</button>
                      </div>
                    ))
                  )}
                </div>

                <button 
                  style={{ ...styles.confirmOrderBtn, padding: '12px', marginTop: '12px' }} 
                  onClick={handleConfirmTakeawayOrder}
                  disabled={takeawayCart.length === 0}
                >
                  Confirm Order & Cetak Label Dapur
                </button>
              </div>

              {/* Panel Kanan: Daftar Antrean Active Takeaway Orders */}
              <div style={styles.rightPanel}>
                <h3 style={styles.sectionTitle}>Daftar Antrean Active Takeaway ({takeawayOrders.length})</h3>
                <div style={{ flex: 1, overflowY: 'auto', marginTop: '12px' }}>
                  {takeawayOrders.length === 0 ? (
                    <p style={styles.mutedText}>Belum ada antrean takeaway aktif</p>
                  ) : (
                    takeawayOrders.map(order => (
                      <div key={order.id} style={{ ...styles.ownerCard, marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '16px', color: '#38bdf8' }}>{order.orderNo} ({order.platform})</strong>
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{order.time}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>Pelanggan: {order.customerName}</div>
                        
                        <div style={{ margin: '8px 0', fontSize: '13px' }}>
                          {order.items.map((it, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{it.qty}x {it.name}</span>
                              <span>Rp {(it.price * it.qty).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        {/* REVISI 2: Menampilkan Subtotal & Diskon secara transparan di Antrean Takeaway */}
                        <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: '2px' }}>
                            <span>Subtotal:</span>
                            <span>Rp {(order.subTotal || order.total + (order.discount || 0)).toLocaleString()}</span>
                          </div>
                          
                          {order.discount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', marginBottom: '4px' }}>
                              <span>Promo Diskon (Otomatis):</span>
                              <span>- Rp {order.discount.toLocaleString()}</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>
                            <span>Total:</span>
                            <span style={{ color: '#10b981' }}>Rp {order.total.toLocaleString()}</span>
                          </div>
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                          {!order.isPaid ? (
                            <button 
                              style={{ ...styles.primaryBtn, flex: 1, padding: '6px', fontSize: '12px' }}
                              onClick={() => { setSelectedTakeawayOrder(order); setShowTakeawayPaymentModal(true); }}
                            >
                              Confirm Payment
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#34d399', display: 'flex', alignItems: 'center', fontWeight: '600' }}>
                              ✓ Sudah Lunas
                            </span>
                          )}

                          <button 
                            style={{ ...styles.dangerOutlineBtn, flex: 1, borderColor: '#10b981', color: '#10b981' }}
                            onClick={() => handleCompleteTakeaway(order.id)}
                          >
                            Selesaikan Order
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* Modal PIN / Password Protection */}
      {showAuthModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ margin: '0 0 12px 0' }}>Masukkan Password Mode {targetRole === 'owner' ? 'Owner' : 'Kasir'}</h3>
            <form onSubmit={handleVerifyPin}>
              <input 
                type="password" 
                placeholder="Masukkan PIN / Password" 
                value={pinInput} 
                onChange={(e) => setPinInput(e.target.value)}
                style={{ ...styles.inputField, marginBottom: '16px' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" style={{ ...styles.dangerOutlineBtn, flex: 1 }} onClick={() => setShowAuthModal(false)}>Batal</button>
                <button type="submit" style={{ ...styles.primaryBtn, flex: 1 }}>Masuk</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pembayaran Dine-In */}
      {showCheckoutModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Rincian Pembayaran ({selectedTable.number})</h3>
            
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '16px' }}>
              {recapList.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #374151', fontSize: '14px' }}>
                  <span>{item.qty}x {item.name}</span>
                  <span>Rp {(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '13px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>Rp {subTotal.toLocaleString()}</span>
            </div>
            {autoDiscount > 0 && (
              <div style={{ fontSize: '13px', color: '#ef4444', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span>Promo Diskon Otomatis:</span>
                <span>- Rp {autoDiscount.toLocaleString()}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', margin: '12px 0', color: '#10b981' }}>
              <span>Total Akhir:</span>
              <span>Rp {finalTotal.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button style={{ ...styles.dangerOutlineBtn, flex: 1 }} onClick={() => setShowCheckoutModal(false)}>
                Batal
              </button>
              <button style={{ ...styles.primaryBtn, flex: 2, background: '#10b981' }} onClick={handlePaymentSuccess}>
                Payment Success & Print Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pembayaran Takeaway */}
      {showTakeawayPaymentModal && selectedTakeawayOrder && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ margin: '0 0 12px 0' }}>Pembayaran Takeaway {selectedTakeawayOrder.orderNo}</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 12px 0' }}>Platform: {selectedTakeawayOrder.platform}</p>

            <div style={{ borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '8px 0', marginBottom: '12px' }}>
              {selectedTakeawayOrder.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{it.qty}x {it.name}</span>
                  <span>Rp {(it.price * it.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              <span>Subtotal:</span>
              <span>Rp {(selectedTakeawayOrder.subTotal || selectedTakeawayOrder.total + (selectedTakeawayOrder.discount || 0)).toLocaleString()}</span>
            </div>

            {selectedTakeawayOrder.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#ef4444', marginBottom: '8px' }}>
                <span>Promo Diskon (Otomatis):</span>
                <span>- Rp {selectedTakeawayOrder.discount.toLocaleString()}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#10b981', marginBottom: '16px' }}>
              <span>Total Tagihan:</span>
              <span>Rp {selectedTakeawayOrder.total.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...styles.dangerOutlineBtn, flex: 1 }} onClick={() => setShowTakeawayPaymentModal(false)}>Batal</button>
              <button style={{ ...styles.primaryBtn, flex: 2, background: '#10b981' }} onClick={() => handlePayTakeaway(selectedTakeawayOrder)}>Konfirmasi Lunas & Print Struk</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Fullscreen Dark SaaS Stylesheet
const styles = {
  appContainer: {
    height: '100vh',
    width: '100vw',
    boxSizing: 'border-box',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0,
  },
  header: {
    height: '56px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    boxSizing: 'border-box',
    width: '100%',
  },
  logoBadge: {
    width: '32px',
    height: '32px',
    backgroundColor: '#3b82f6',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '14px',
  },
  headerTitle: { fontSize: '18px', fontWeight: '600', margin: 0 },
  roleBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '13px' },
  activeRoleBtn: { background: '#334155', border: 'none', color: '#fff', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontWeight: '600', fontSize: '13px' },
  modeNavBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px 10px', cursor: 'pointer', borderRadius: '6px', fontSize: '12px' },
  activeModeNavBtn: { background: '#2563eb', border: 'none', color: '#fff', padding: '6px 10px', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', fontWeight: '600' },

  mainLayout: { flex: 1, display: 'flex', overflow: 'hidden', width: '100%', boxSizing: 'border-box' },
  leftPanel: { flex: 2, padding: '20px', overflowY: 'auto', borderRight: '1px solid #334155', boxSizing: 'border-box' },
  rightPanel: { flex: 1.1, padding: '20px', backgroundColor: '#1e293b', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  
  sectionTitle: { fontSize: '15px', fontWeight: '600', margin: 0, color: '#e2e8f0' },
  tableGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px', marginTop: '12px' },
  tableCard: {
    padding: '12px 8px',
    borderRadius: '10px',
    border: '2px solid',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  statusBadge: { fontSize: '11px', padding: '2px 6px', borderRadius: '12px', marginTop: '6px', display: 'inline-block', fontWeight: '500' },
  
  openTablePromptCard: { padding: '24px', border: '1px dashed #475569', borderRadius: '12px', textAlign: 'center', marginTop: '12px' },
  menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginTop: '12px' },
  menuCard: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  addMenuBtn: { width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #334155', marginBottom: '12px' },
  emptyStateContainer: { display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  
  sectionBlock: { marginBottom: '16px' },
  subTitle: { fontSize: '12px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '8px' },
  mutedText: { fontSize: '13px', color: '#64748b', margin: 0 },
  
  cartRow: { display: 'flex', alignItems: 'center', background: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155' },
  deleteBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '4px 8px' },
  confirmOrderBtn: { width: '100%', padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', marginTop: '8px', fontSize: '13px' },
  
  batchCard: { background: '#0f172a', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #3b82f6', marginBottom: '8px' },
  batchHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' },
  badgeSent: { color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' },
  
  paymentFooter: { marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #334155' },
  primaryBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' },
  
  inputField: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', backgroundColor: '#0f172a', color: '#fff', boxSizing: 'border-box' },
  ownerCard: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '16px' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', width: '380px', boxSizing: 'border-box' },
};
