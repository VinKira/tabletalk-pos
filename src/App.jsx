import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  // --- Auth State ---
  const [userRole, setUserRole] = useState('cashier'); // default ke cashier untuk kemudahan dev

  // --- POS State ---
  const [tables, setTables] = useState([
    { id: 1, number: 'Meja 01', status: 'available' },
    { id: 2, number: 'Meja 02', status: 'available' },
    { id: 3, number: 'Meja 03', status: 'available' },
    { id: 4, number: 'Meja 04', status: 'available' },
    { id: 5, number: 'Meja 05', status: 'available' },
  ]);

  const [selectedTable, setSelectedTable] = useState(null);
  
  // Storage State per Meja: 
  // - activeSessions: { tableId: sessionId }
  // - confirmedOrders: { tableId: [ { batchId, time, items: [] } ] }
  // - currentCart: { tableId: [ { id, name, price, qty, category } ] }
  const [activeSessions, setActiveSessions] = useState({});
  const [confirmedOrders, setConfirmedOrders] = useState({});
  const [currentCart, setCurrentCart] = useState({});
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Sample Menu
  const menuList = [
    { id: 101, name: 'Americano', price: 22000, category: 'drink' },
    { id: 102, name: 'Latte', price: 28000, category: 'drink' },
    { id: 103, name: 'Mie Goreng', price: 25000, category: 'food' },
    { id: 104, name: 'Nasi Goreng', price: 28000, category: 'food' },
  ];

  // --- 1. Aksi Klik Kartu Meja ---
  const handleSelectTable = (table) => {
    setSelectedTable(table);
  };

  // --- 2. Open Table ---
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

  // --- 3. Cancel Open Table (Saat belum ada pesanan terkonfirmasi) ---
  const handleCancelOpenTable = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    setActiveSessions(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setConfirmedOrders(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'available' } : t));
    setSelectedTable(prev => ({ ...prev, status: 'available' }));
  };

  // --- 4. Tambah Menu ke Keranjang Draft ---
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

  // --- 5. Hapus Menu dari Keranjang Draft (Tombol X) ---
  const handleRemoveFromCart = (itemId) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    
    const updatedCart = cart.filter(item => item.id !== itemId);
    setCurrentCart(prev => ({ ...prev, [tableId]: updatedCart }));
  };

  // --- 6. Confirm Order (Kirim ke Dapur / Connect Printer Label) ---
  const handleConfirmOrder = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    if (cart.length === 0) return alert('Keranjang pesanan masih kosong!');

    // Hubungkan / cetak ke Printer Dapur
    await printKitchenLabelBatch(cart);

    // Masukkan ke daftar pesanan terkonfirmasi (Batch Timeline)
    const newBatch = {
      batchId: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'Kasir',
      items: [...cart]
    };

    const existingBatches = confirmedOrders[tableId] || [];
    setConfirmedOrders(prev => ({ ...prev, [tableId]: [...existingBatches, newBatch] }));

    // Reset keranjang draft untuk meja ini
    setCurrentCart(prev => ({ ...prev, [tableId]: [] }));

    alert('Order berhasil dikonfirmasi & dikirim ke Printer Dapur!');
  };

  // Print Label Dapur Helper
  const printKitchenLabelBatch = async (items) => {
    try {
      if (navigator.bluetooth) {
        // Simulasi trigger pencarian printer bluetooth jika didukung
        console.log('Connecting to Bluetooth Kitchen Printer...');
      }
    } catch (e) {
      console.log('Simulation Printer Active');
    }
  };

  // --- 7. Hitung Total Rekap Seluruh Batch Pesanan ---
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
    const grandTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    return { recapList, grandTotal, batches };
  };

  // --- 8. Payment Success & Close Table ---
  const handlePaymentSuccess = () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    // Trigger Print Struk Kasir
    alert('Menghubungkan ke Printer Struk... Struk Berhasil Dicetak!');

    // Reset Meja Kembali Kosong
    setActiveSessions(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setConfirmedOrders(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'available' } : t));
    setSelectedTable(prev => ({ ...prev, status: 'available' }));
    setShowCheckoutModal(false);
  };

  const activeTableId = selectedTable?.id;
  const activeTableStatus = selectedTable?.status;
  const cartItems = activeTableId ? (currentCart[activeTableId] || []) : [];
  const { recapList, grandTotal, batches } = activeTableId ? getTableRecap(activeTableId) : { recapList: [], grandTotal: 0, batches: [] };

  return (
    <div style={styles.appContainer}>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logoBadge}>TT</div>
          <h1 style={styles.headerTitle}>TableTalk POS</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={userRole === 'cashier' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => setUserRole('cashier')}>Kasir Mode</button>
          <button style={userRole === 'owner' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => setUserRole('owner')}>Owner Mode</button>
        </div>
      </header>

      {/* Main Layout */}
      <div style={styles.mainLayout}>
        {/* Panel Kiri: Grid Meja & Menu catalog */}
        <div style={styles.leftPanel}>
          {/* Section 1: Grid Meja */}
          <div style={{ marginBottom: '28px' }}>
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
                    <div style={{ fontWeight: '600', fontSize: '16px' }}>{t.number}</div>
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

          {/* Section 2: Catalog Menu */}
          {selectedTable && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={styles.sectionTitle}>Pilih Menu ({selectedTable.number})</h3>
                {activeTableStatus === 'occupied' && (
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>Klik menu untuk menambah ke draft</span>
                )}
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
                        <div style={{ fontWeight: '600', fontSize: '15px' }}>{menu.name}</div>
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
                  <h2 style={{ margin: 0, fontSize: '20px' }}>{selectedTable.number}</h2>
                  <span style={{ fontSize: '13px', color: activeTableStatus === 'occupied' ? '#34d399' : '#9ca3af' }}>
                    Status: {activeTableStatus === 'occupied' ? 'Sesi Aktif' : 'Kosong'}
                  </span>
                </div>

                {/* Cancel Open Table button jika belum ada order terkonfirmasi */}
                {activeTableStatus === 'occupied' && batches.length === 0 && cartItems.length === 0 && (
                  <button style={styles.dangerOutlineBtn} onClick={handleCancelOpenTable}>
                    Cancel Open Table
                  </button>
                )}
              </div>

              {activeTableStatus === 'occupied' && (
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                  
                  {/* Draft Cart Item Baru (Belum dikonfirmasi) */}
                  <div style={styles.sectionBlock}>
                    <h4 style={styles.subTitle}>Draft Pesanan Baru (Belum Kirim)</h4>
                    {cartItems.length === 0 ? (
                      <p style={styles.mutedText}>Belum ada menu yang dipilih</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cartItems.map(item => (
                          <div key={item.id} style={styles.cartRow}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '500' }}>{item.name}</div>
                              <small style={{ color: '#9ca3af' }}>Rp {item.price.toLocaleString()} x {item.qty}</small>
                            </div>
                            <div style={{ fontWeight: '600', marginRight: '12px' }}>
                              Rp {(item.price * item.qty).toLocaleString()}
                            </div>
                            <button style={styles.deleteBtn} onClick={() => handleRemoveFromCart(item.id)}>✕</button>
                          </div>
                        ))}

                        <button style={styles.confirmOrderBtn} onClick={handleConfirmOrder}>
                          Confirm Order (Print Label Dapur)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Batch Timeline Pesanan Terkonfirmasi */}
                  <div style={styles.sectionBlock}>
                    <h4 style={styles.subTitle}>Riwayat Order Dapur (Terproses)</h4>
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

              {/* Bottom Payment Footer (Selalu Terlihat bila Meja Terisi) */}
              {activeTableStatus === 'occupied' && (
                <div style={styles.paymentFooter}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ color: '#9ca3af' }}>Total Tagihan:</span>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
                      Rp {grandTotal.toLocaleString()}
                    </span>
                  </div>
                  <button 
                    style={{ ...styles.primaryBtn, width: '100%', padding: '14px', fontSize: '15px' }}
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

      {/* Modal Pembayaran Close Table */}
      {showCheckoutModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Rincian Pembayaran ({selectedTable.number})</h3>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
              {recapList.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #374151', fontSize: '14px' }}>
                  <span>{item.qty}x {item.name}</span>
                  <span>Rp {(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', margin: '16px 0', color: '#10b981' }}>
              <span>Total Akhir:</span>
              <span>Rp {grandTotal.toLocaleString()}</span>
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

// Modern Dark SaaS Stylesheet
const styles = {
  appContainer: {
    height: '100vh',
    width: '100vw',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    height: '60px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
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
  roleBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px' },
  activeRoleBtn: { background: '#334155', border: 'none', color: '#fff', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontWeight: '600' },
  
  mainLayout: { flex: 1, display: 'flex', overflow: 'hidden' },
  leftPanel: { flex: 2, padding: '24px', overflowY: 'auto', borderRight: '1px solid #334155' },
  rightPanel: { flex: 1.2, padding: '24px', backgroundColor: '#1e293b', display: 'flex', flexDirection: 'column' },
  
  sectionTitle: { fontSize: '16px', fontWeight: '600', margin: 0, color: '#e2e8f0' },
  tableGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '12px', marginTop: '12px' },
  tableCard: {
    padding: '16px 12px',
    borderRadius: '10px',
    border: '2px solid',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  statusBadge: { fontSize: '11px', padding: '2px 8px', borderRadius: '12px', marginTop: '8px', display: 'inline-block', fontWeight: '500' },
  
  openTablePromptCard: { padding: '32px', border: '1px dashed #475569', borderRadius: '12px', textAlign: 'center', marginTop: '12px' },
  menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' },
  menuCard: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  addMenuBtn: { width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #334155', marginBottom: '16px' },
  emptyStateContainer: { display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  
  sectionBlock: { marginBottom: '20px' },
  subTitle: { fontSize: '13px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '10px' },
  mutedText: { fontSize: '13px', color: '#64748b', margin: 0 },
  
  cartRow: { display: 'flex', alignItems: 'center', background: '#0f172a', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' },
  deleteBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '4px 8px' },
  confirmOrderBtn: { width: '100%', padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', marginTop: '10px' },
  
  batchCard: { background: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #3b82f6', marginBottom: '8px' },
  batchHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' },
  badgeSent: { color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' },
  
  paymentFooter: { marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #334155' },
  primaryBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '600', cursor: 'pointer' },
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', z-index: 100 },
  modalCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '400px' },
};
