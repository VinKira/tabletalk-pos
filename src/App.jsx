import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  // --- Auth State ---
  const [userRole, setUserRole] = useState(null); // 'cashier' | 'owner'
  
  // --- POS State ---
  const [tables, setTables] = useState([
    { id: 1, number: 'Meja 01', status: 'available' },
    { id: 2, number: 'Meja 02', status: 'available' },
    { id: 3, number: 'Meja 03', status: 'available' },
  ]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [orderBatches, setOrderBatches] = useState([]);
  
  // Menu items contoh
  const menuList = [
    { id: 101, name: 'Americano', price: 22000, category: 'drink' },
    { id: 102, name: 'Mie Goreng', price: 25000, category: 'food' }
  ];

  // --- Realtime Sync dari Self-Order Customer ---
  useEffect(() => {
    if (!activeSession) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.new.session_id === activeSession.id) {
          console.log('Pesanan baru masuk dari Self-Order:', payload.new);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeSession]);

  // --- 1. Fungsi Open Table ---
  const handleOpenTable = (table) => {
    const newSession = { id: crypto.randomUUID(), table_id: table.id, status: 'open' };
    setSelectedTable(table);
    setActiveSession(newSession);
    setTables(tables.map(t => t.id === table.id ? { ...t, status: 'occupied' } : t));
    setOrderBatches([]);
  };

  // --- 2. Tambah Pesanan dari Kasir Manual ---
  const handleAddManualOrder = (item) => {
    if (!activeSession) return alert('Buka meja terlebih dahulu!');
    
    const newBatch = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'Manual Kasir',
      items: [{ ...item, qty: 1 }]
    };

    setOrderBatches([...orderBatches, newBatch]);
    printKitchenLabel(item.name, item.category);
  };

  // --- 3. Print Label Dapur via Web Bluetooth API ---
  const printKitchenLabel = async (itemName, category) => {
    try {
      if (navigator.bluetooth) {
        await navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }]
        });
      }
    } catch (err) {
      console.log('Simulation Mode: Print Label ->', itemName);
    }
  };

  // --- 4. Close Table & Rekap Total ---
  const handleCloseTable = () => {
    const recapMap = {};
    orderBatches.forEach(batch => {
      batch.items.forEach(item => {
        if (recapMap[item.name]) {
          recapMap[item.name].qty += item.qty;
        } else {
          recapMap[item.name] = { ...item };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const grandTotal = recapList.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);

    return { recapList, grandTotal };
  };

  // --- UI Login View ---
  if (!userRole) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', color: '#fff' }}>
        <h2>Login System POS TableTalk</h2>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={() => setUserRole('cashier')} style={btnStyle}>Login sebagai Kasir</button>
          <button onClick={() => setUserRole('owner')} style={{ ...btnStyle, background: '#8b5cf6' }}>Login sebagai Owner</button>
        </div>
      </div>
    );
  }

  // --- UI Owner View ---
  if (userRole === 'owner') {
    return (
      <div style={{ padding: 20, fontFamily: 'sans-serif', color: '#fff' }}>
        <h2>Dashboard Owner</h2>
        <p>Ringkasan Laporan Penjualan Realtime & Manajemen Stock.</p>
        <button onClick={() => setUserRole(null)} style={btnDanger}>Logout</button>
      </div>
    );
  }

  // --- UI POS Kasir View ---
  const recapData = activeSession ? handleCloseTable() : { recapList: [], grandTotal: 0 };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', color: '#333' }}>
      
      {/* Panel Kiri: Grid Meja & Menu */}
      <div style={{ flex: 2, padding: 20, borderRight: '1px solid #ddd', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Daftar Meja</h2>
          <button onClick={() => setUserRole(null)} style={btnDanger}>Logout Kasir</button>
        </div>

        {/* Status Meja */}
        <div style={{ display: 'flex', gap: 15, marginBottom: 30 }}>
          {tables.map(t => (
            <div 
              key={t.id} 
              onClick={() => handleOpenTable(t)}
              style={{
                padding: 20, 
                borderRadius: 8, 
                cursor: 'pointer',
                background: t.status === 'occupied' ? '#fee2e2' : '#dcfce7',
                border: selectedTable?.id === t.id ? '2px solid #2563eb' : '1px solid #ccc'
              }}
            >
              <h3>{t.number}</h3>
              <p>{t.status === 'occupied' ? 'Terisi' : 'Kosong (Open)'}</p>
            </div>
          ))}
        </div>

        {/* Menu Pilihan Manual */}
        {selectedTable && (
          <>
            <h3>Tambah Pesanan Manual ({selectedTable.number})</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              {menuList.map(item => (
                <button key={item.id} onClick={() => handleAddManualOrder(item)} style={btnStyle}>
                  + {item.name} (Rp {item.price.toLocaleString()})
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Panel Kanan: Timeline Pesanan per Meja & Rekap Close Table */}
      <div style={{ flex: 1.5, padding: 20, background: '#f9fafb', overflowY: 'auto' }}>
        <h2>Rincian {selectedTable ? selectedTable.number : 'Pilih Meja'}</h2>
        
        {!activeSession ? (
          <p>Silakan klik salah satu meja untuk membuka sesi transaksi.</p>
        ) : (
          <>
            {/* Timeline Batch Order */}
            <div style={{ marginBottom: 20 }}>
              <h4>Daftar Urutan Order (Batch Timeline):</h4>
              {orderBatches.map((batch, idx) => (
                <div key={idx} style={{ background: '#fff', padding: 10, borderRadius: 6, marginBottom: 10, borderLeft: '4px solid #2563eb' }}>
                  <small style={{ color: '#666' }}>Jam {batch.time} - Via: <strong>{batch.type}</strong></small>
                  {batch.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>{it.qty}x {it.name}</span>
                      <span>Rp {(it.price * it.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <hr />

            {/* Totalan Rekap Close Table */}
            <div style={{ marginTop: 20 }}>
              <h4>Rekap Akhir (Totalan Close Table):</h4>
              {recapData.recapList.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{item.qty}x {item.name}</span>
                  <span>Rp {(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
              
              <h3 style={{ marginTop: 15, color: '#059669' }}>
                Total Bayar: Rp {recapData.grandTotal.toLocaleString()}
              </h3>

              <button 
                onClick={() => {
                  alert('Pembayaran Sukses! Struk Terpesan.');
                  setTables(tables.map(t => t.id === selectedTable.id ? { ...t, status: 'available' } : t));
                  setSelectedTable(null);
                  setActiveSession(null);
                }}
                style={{ ...btnStyle, width: '100%', padding: 15, background: '#059669', marginTop: 10 }}
              >
                Confirm Payment & Print Struk
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

const btnStyle = { padding: '10px 15px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnDanger = { ...btnStyle, background: '#dc2626' };
