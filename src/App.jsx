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

  // --- Auth State ---
  const [userRole, setUserRole] = useState('cashier'); // 'cashier' | 'owner'

  // --- Dynamic Tables & Menu State ---
  const [tables, setTables] = useState([
    { id: 1, number: 'Meja 01', status: 'available' },
    { id: 2, number: 'Meja 02', status: 'available' },
    { id: 3, number: 'Meja 03', status: 'available' },
    { id: 4, number: 'Meja 04', status: 'available' },
    { id: 5, number: 'Meja 05', status: 'available' },
  ]);

  const [menuList, setMenuList] = useState([
    { id: 101, name: 'Americano', price: 22000, category: 'drink' },
    { id: 102, name: 'Latte', price: 28000, category: 'drink' },
    { id: 103, name: 'Mie Goreng', price: 25000, category: 'food' },
    { id: 104, name: 'Nasi Goreng', price: 28000, category: 'food' },
  ]);

  // Form State untuk Owner
  const [newTableName, setNewTableName] = useState('');
  const [menuForm, setMenuForm] = useState({ id: null, name: '', price: '', category: 'food' });
  const [isEditingMenu, setIsEditingMenu] = useState(false);

  // --- POS Session & Cart State ---
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeSessions, setActiveSessions] = useState({});
  const [confirmedOrders, setConfirmedOrders] = useState({});
  const [currentCart, setCurrentCart] = useState({});
  
  // Checkout & Discount State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);

  // --- 1. Manajemen Meja ---
  const handleSelectTable = (table) => {
    setSelectedTable(table);
  };

  const handleAddTable = (e) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    const newId = tables.length ? Math.max(...tables.map(t => t.id)) + 1 : 1;
    setTables([...tables, { id: newId, number: newTableName, status: 'available' }]);
    setNewTableName('');
  };

  // --- 2. Manajemen Menu (Owner) ---
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

  // --- 3. Alur Operasional POS ---
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
          recapMap[it.name] = { ...it };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const subTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    return { recapList, subTotal, batches };
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
    setDiscountAmount(0);
  };

  const activeTableId = selectedTable?.id;
  const activeTableStatus = selectedTable?.status;
  const cartItems = activeTableId ? (currentCart[activeTableId] || []) : [];
  const { recapList, subTotal, batches } = activeTableId ? getTableRecap(activeTableId) : { recapList: [], subTotal: 0, batches: [] };
  const finalTotal = Math.max(0, subTotal - Number(discountAmount));

  return (
    <div style={styles.appContainer}>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logoBadge}>TT</div>
          <h1 style={styles.headerTitle}>TableTalk POS</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={userRole === 'cashier' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => setUserRole('cashier')}>Kasir Mode</button>
          <button style={userRole === 'owner' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => setUserRole('owner')}>Owner Mode (Kelola Menu)</button>
        </div>
      </header>

      {/* Mode Owner: Kelola Menu & Meja */}
      {userRole === 'owner' ? (
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, boxSizing: 'border-box' }}>
          <h2 style={{ marginTop: 0 }}>Panel Owner - Kelola Meja & Menu</h2>
          
          {/* Form Tambah Meja */}
          <div style={styles.ownerCard}>
            <h3>Tambah Meja</h3>
            <form onSubmit={handleAddTable} style={{ display: 'flex', gap: '12px' }}>
              <input 
                type="text" 
                placeholder="Nama Meja (contoh: Meja 06 / VIP 1)" 
                value={newTableName} 
                onChange={(e) => setNewTableName(e.target.value)}
                style={styles.inputField}
              />
              <button type="submit" style={styles.primaryBtn}>+ Tambah Meja</button>
            </form>
          </div>

          {/* Form Tambah / Edit Menu */}
          <div style={styles.ownerCard}>
            <h3>{isEditingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h3>
            <form onSubmit={handleSaveMenu} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
                {isEditingMenu ? 'Simpan Perubahan' : '+ Tambah Menu'}
              </button>
              {isEditingMenu && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingMenu(false); setMenuForm({ id: null, name: '', price: '', category: 'food' }); }}>
                  Batal
                </button>
              )}
            </form>
          </div>

          {/* Daftar Menu Saat Ini */}
          <div style={styles.ownerCard}>
            <h3>Daftar Katalog Menu ({menuList.length})</h3>
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
        </div>
      ) : (
        /* Mode Kasir (Main Layout POS) */
        <div style={styles.mainLayout}>
          {/* Panel Kiri: Grid Meja & Menu */}
          <div style={styles.leftPanel}>
            {/* Status Meja */}
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

            {/* Catalog Menu */}
            {selectedTable && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={styles.sectionTitle}>Pilih Menu ({selectedTable.number})</h3>
                </div>

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
                
                {/* Header Panel Meja */}
                <div style={styles.panelHeader}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>{selectedTable.number}</h2>
                    <span style={{ fontSize: '12px', color: activeTableStatus === 'occupied' ? '#34d399' : '#9ca3af' }}>
                      Status: {activeTableStatus === 'occupied' ? 'Sesi Aktif' : 'Kosong'}
                    </span>
                  </div>

                  {activeTableStatus === 'occupied' && batches.length === 0 && cartItems.length === 0 && (
                    <button style={styles.dangerOutlineBtn} onClick={handleCancelOpenTable}>
                      Cancel Open Table
                    </button>
                  )}
                </div>

                {activeTableStatus === 'occupied' && (
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    
                    {/* Draft Cart Item Baru */}
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

                    {/* Batch Timeline Pesanan Terkonfirmasi */}
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

                {/* Bottom Payment Footer */}
                {activeTableStatus === 'occupied' && (
                  <div style={styles.paymentFooter}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ color: '#9ca3af' }}>Subtotal Tagihan:</span>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>
                        Rp {subTotal.toLocaleString()}
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
        </div>
      )}

      {/* Modal Pembayaran Close Table & Discount */}
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

            {/* Input Nominal Diskon */}
            <div style={{ marginBottom: '16px', background: '#0f172a', padding: '12px', borderRadius: '8px' }}>
              <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>Nominal Diskon (Rp):</label>
              <input 
                type="number" 
                placeholder="0" 
                value={discountAmount} 
                onChange={(e) => setDiscountAmount(e.target.value)}
                style={styles.inputField}
              />
            </div>

            <div style={{ fontSize: '13px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>Rp {subTotal.toLocaleString()}</span>
            </div>
            {Number(discountAmount) > 0 && (
              <div style={{ fontSize: '13px', color: '#ef4444', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span>Diskon:</span>
                <span>- Rp {Number(discountAmount).toLocaleString()}</span>
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

    </div>
  );
}

// Strict Fullscreen Layout Stylesheet
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
  
  inputField: { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', backgroundColor: '#0f172a', color: '#fff', boxSizing: 'border-box' },
  ownerCard: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '16px' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', width: '380px', boxSizing: 'border-box' },
};
