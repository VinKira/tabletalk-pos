import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

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

  // --- Dynamic Tables, Menu & Promo State (Connected to Supabase Realtime) ---
  const [tables, setTables] = useState([]);
  const [menuList, setMenuList] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);

  // --- State Pesanan Supabase Realtime ---
  const [activeSessions, setActiveSessions] = useState({}); // { [tableId]: session_id }
  const [confirmedOrders, setConfirmedOrders] = useState({}); // { [tableId]: [batches] }
  const [takeawayOrders, setTakeawayOrders] = useState([]); // [array of takeaway orders]

  // Fetch Data Awal & Realtime Subscription Supabase
  useEffect(() => {
    fetchTables();
    fetchMenuList();
    fetchDiscountRules();
    fetchActiveOrders();

    // 1. Listen Perubahan Meja Realtime
    const tableChannel = supabase
      .channel('public:tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchTables();
      })
      .subscribe();

    // 2. Listen Perubahan Menu Realtime
const menuChannel = supabase
  .channel('public:menu_list')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_list' }, () => {
    fetchMenuList();
    fetchActiveOrders(); // Tambahkan ini agar merespons perubahan harga
  })
  .subscribe();

    // 3. Listen Perubahan Promo Realtime
    const discountChannel = supabase
      .channel('public:discount_rules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discount_rules' }, () => {
        fetchDiscountRules();
      })
      .subscribe();

    // 4. Listen Perubahan Transaksi & Order Realtime
    const orderChannel = supabase
      .channel('public:orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchActiveOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
        fetchActiveOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchActiveOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => {
        fetchActiveOrders();
      })
      .subscribe();

    // Cleanup SEMUA channel
    return () => {
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(discountChannel);
      supabase.removeChannel(orderChannel);
    };
  }, []);

  const fetchTables = async () => {
    const { data, error } = await supabase.from('tables').select('*').order('id', { ascending: true });
    if (!error && data) setTables(data);
  };

  const fetchMenuList = async () => {
    const { data, error } = await supabase.from('menu_list').select('*').order('id', { ascending: true });
    if (!error && data) setMenuList(data);
  };

  const fetchDiscountRules = async () => {
    const { data, error } = await supabase.from('discount_rules').select('*').order('id', { ascending: true });
    if (!error && data) {
      const formatted = data.map(item => ({
        id: item.id,
        menuId: Number(item.menu_id),
        menuName: item.menu_name,
        minQty: Number(item.min_qty),
        discountAmount: Number(item.discount_amount)
      }));
      setDiscountRules(formatted);
    }
  };

  // Synchronize Active Orders (Dine-In & Takeaway) from Supabase
  const fetchActiveOrders = async () => {
    // 1. Fetch Active Dine-In Sessions
    const { data: openSessions } = await supabase
      .from('table_sessions')
      .select('*')
      .eq('status', 'open');

    const sessionsMap = {};
    if (openSessions) {
      openSessions.forEach(s => {
        sessionsMap[s.table_id] = s.id;
      });
    }
    setActiveSessions(sessionsMap);

    // 2. Fetch Active Dine-In Orders & Batches
    const { data: dineInOrders } = await supabase
      .from('orders')
      .select(`
        id,
        table_id,
        session_id,
        created_at,
        order_batches (
          id,
          created_at,
          order_items ( id, menu_id, menu_name, price, qty, category )
        )
      `)
      .eq('order_type', 'dine-in')
      .eq('status', 'active');

    const confirmedMap = {};
    if (dineInOrders) {
      dineInOrders.forEach(ord => {
        const tId = ord.table_id;
        const batches = (ord.order_batches || []).map(b => ({
          batchId: b.id,
          time: new Date(b.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          type: 'Kasir',
          items: (b.order_items || []).map(it => {
            // Cari harga terbaru di master menu, jika tidak ada baru gunakan harga lama
            const liveMenu = menuList.find(m => m.id === it.menu_id);
            const currentPrice = liveMenu ? Number(liveMenu.price) : Number(it.price);
        
            return {
              id: it.menu_id,
              name: it.menu_name,
              price: currentPrice, // Menggunakan harga live
              qty: Number(it.qty)
            };
          })
        }));

    // 3. Fetch Active Takeaway Orders
    const { data: takeaways } = await supabase
      .from('orders')
      .select(`
        *,
        order_items ( id, menu_id, menu_name, price, qty, category )
      `)
      .eq('order_type', 'takeaway')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

if (takeaways) {
      const formattedTakeaway = takeaways.map(t => {
        const items = (t.order_items || []).map(it => {
          // Cari harga terbaru di master menuList
          const liveMenu = menuList.find(m => m.id === Number(it.menu_id));
          const currentPrice = liveMenu ? Number(liveMenu.price) : Number(it.price);

          return {
            id: it.menu_id,
            name: it.menu_name,
            price: currentPrice, // Menggunakan harga ter-update dari master menu
            qty: Number(it.qty)
          };
        });

        // Hitung ulang subtotal & diskon secara realtime berdasarkan harga & promo terbaru
        const subTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const discount = calculateAutoDiscount(items); 
        const total = Math.max(0, subTotal - discount);

        return {
          id: t.id,
          orderNo: t.order_no,
          platform: t.platform,
          customerName: t.customer_name || 'Pelanggan',
          subTotal,
          discount,
          total,
          isPaid: Boolean(t.is_paid),
          time: new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          items
        };
      });
      setTakeawayOrders(formattedTakeaway);
    }

  const [discountForm, setDiscountForm] = useState({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);

  // Form State untuk Owner (Meja & Menu)
  const [tableForm, setTableForm] = useState({ id: null, number: '' });
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [menuForm, setMenuForm] = useState({ id: null, name: '', price: '', category: 'food' });
  const [isEditingMenu, setIsEditingMenu] = useState(false);

  // --- POS Mode Selection ---
  const [posMode, setPosMode] = useState('dine-in'); // 'dine-in' | 'takeaway'

  // --- Dine-In State (Draft Cart di LocalStorage) ---
  const [selectedTable, setSelectedTable] = useState(null);

  const [currentCart, setCurrentCart] = useState(() => {
    const saved = localStorage.getItem('pos_dinein_current_cart');
    return saved ? JSON.parse(saved) : {};
  });

  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // --- Takeaway State ---
  const [takeawayPlatform, setTakeawayPlatform] = useState('On Site');
  const [takeawayCustomerName, setTakeawayCustomerName] = useState('');
  const [takeawayOrderNoInput, setTakeawayOrderNoInput] = useState('');
  
  const [autoTakeawayCounter, setAutoTakeawayCounter] = useState(() => {
    const saved = localStorage.getItem('pos_takeaway_counter');
    return saved ? JSON.parse(saved) : 1;
  });

  const [takeawayCart, setTakeawayCart] = useState(() => {
    const saved = localStorage.getItem('pos_draft_takeaway_cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedTakeawayOrder, setSelectedTakeawayOrder] = useState(null);
  const [showTakeawayPaymentModal, setShowTakeawayPaymentModal] = useState(false);

  // Auto-Save Draft Carts
  useEffect(() => {
    localStorage.setItem('pos_dinein_current_cart', JSON.stringify(currentCart));
  }, [currentCart]);

  useEffect(() => {
    localStorage.setItem('pos_takeaway_counter', JSON.stringify(autoTakeawayCounter));
  }, [autoTakeawayCounter]);

  useEffect(() => {
    localStorage.setItem('pos_draft_takeaway_cart', JSON.stringify(takeawayCart));
  }, [takeawayCart]);

  // --- 1. Manajemen Meja CRUD ---
  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!tableForm.number.trim()) return;

    if (isEditingTable) {
      const { error } = await supabase
        .from('tables')
        .update({ number: tableForm.number })
        .eq('id', tableForm.id);

      if (error) {
        alert('Gagal update meja: ' + error.message);
      } else {
        setIsEditingTable(false);
        fetchTables();
      }
    } else {
      const { error } = await supabase
        .from('tables')
        .insert([{ number: tableForm.number, status: 'available' }]);

      if (error) {
        alert('Gagal tambah meja: ' + error.message);
      } else {
        fetchTables();
      }
    }
    setTableForm({ id: null, number: '' });
  };

  const handleEditTableClick = (t) => {
    setTableForm(t);
    setIsEditingTable(true);
  };

  const handleDeleteTable = async (id) => {
    if (confirm('Yakin ingin menghapus meja ini?')) {
      const { error } = await supabase.from('tables').delete().eq('id', id);
      if (error) {
        alert('Gagal hapus meja: ' + error.message);
      } else {
        if (selectedTable?.id === id) setSelectedTable(null);
        fetchTables();
      }
    }
  };

  // --- 2. Manajemen Menu CRUD ---
  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!menuForm.name || !menuForm.price) return alert('Nama dan Harga wajib diisi!');

    const parsedPrice = Number(menuForm.price);

    if (isEditingMenu) {
      const { error } = await supabase
        .from('menu_list')
        .update({ name: menuForm.name, price: parsedPrice, category: menuForm.category })
        .eq('id', menuForm.id);

      if (error) alert('Gagal update menu: ' + error.message);
      else setIsEditingMenu(false);
    } else {
      const { error } = await supabase
        .from('menu_list')
        .insert([{ name: menuForm.name, price: parsedPrice, category: menuForm.category }]);

      if (error) alert('Gagal tambah menu: ' + error.message);
    }
    setMenuForm({ id: null, name: '', price: '', category: 'food' });
  };

  const handleEditMenuClick = (item) => {
    setMenuForm(item);
    setIsEditingMenu(true);
  };

  const handleDeleteMenu = async (id) => {
    if (confirm('Yakin ingin menghapus menu ini?')) {
      const { error } = await supabase.from('menu_list').delete().eq('id', id);
      if (error) alert('Gagal hapus menu: ' + error.message);
    }
  };

  // --- 3. Manajemen Promo Diskon CRUD ---
  const handleSaveDiscountRule = async (e) => {
    e.preventDefault();
    if (!discountForm.menuId) return alert('Pilih menu terlebih dahulu!');

    const selectedMenuId = Number(discountForm.menuId);
    const targetMenu = menuList.find(m => m.id === selectedMenuId);
    if (!targetMenu) return alert('Menu tidak ditemukan!');

    const payload = {
      menu_id: selectedMenuId,
      menu_name: targetMenu.name,
      min_qty: Number(discountForm.minQty) || 1,
      discount_amount: Number(discountForm.discountAmount) || 0
    };

    if (isEditingDiscount && discountForm.id) {
      const { error } = await supabase.from('discount_rules').update(payload).eq('id', discountForm.id);
      if (error) alert('Gagal update promo: ' + error.message);
      else setIsEditingDiscount(false);
    } else {
      const { error } = await supabase.from('discount_rules').insert([payload]);
      if (error) alert('Gagal buat promo: ' + error.message);
    }
    setDiscountForm({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  };

  const handleDeleteDiscountRule = async (id) => {
    if (confirm('Hapus rule promo ini?')) {
      const { error } = await supabase.from('discount_rules').delete().eq('id', id);
      if (error) alert('Gagal hapus promo: ' + error.message);
    }
  };

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

  // --- 4. Alur Operasional POS (Dine-In - CONNECTED TO SUPABASE) ---
  const handleSelectTable = (table) => {
    setSelectedTable(table);
  };

// 1. OPEN TABLE DINE-IN
  const handleOpenTable = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    try {
      // Buat Table Session Baru
      const { data: sessionData, error: sessionErr } = await supabase
        .from('table_sessions')
        .insert([{ table_id: tableId, status: 'open' }])
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Buat Order Dine-In Utama
      const { error: orderErr } = await supabase
        .from('orders')
        .insert([{
          session_id: sessionData.id,
          table_id: tableId,
          order_type: 'dine-in',
          status: 'active'
        }]);

      if (orderErr) throw orderErr;

      // Update Status Meja
      const { error: tableErr } = await supabase
        .from('tables')
        .update({ status: 'occupied' })
        .eq('id', tableId);

      if (tableErr) throw tableErr;

      fetchTables();
      fetchActiveOrders();
      setSelectedTable(prev => ({ ...prev, status: 'occupied' }));
    } catch (err) {
      console.error("Error Open Table:", err);
      alert('Gagal Open Table: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  // 2. CANCEL OPEN TABLE
  const handleCancelOpenTable = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const sessionId = activeSessions[tableId];

    try {
      if (sessionId) {
        await supabase.from('table_sessions').update({ status: 'closed' }).eq('id', sessionId);
        await supabase.from('orders').update({ status: 'completed' }).eq('session_id', sessionId);
      } else {
        await supabase.from('orders').update({ status: 'completed' }).eq('table_id', tableId).eq('status', 'active');
      }

      await supabase.from('tables').update({ status: 'available' }).eq('id', tableId);

      // Reset Draft Cart Lokal Meja Ini
      setCurrentCart(prev => {
        const updated = { ...prev };
        delete updated[tableId];
        return updated;
      });

      fetchTables();
      fetchActiveOrders();
      setSelectedTable(prev => ({ ...prev, status: 'available' }));
    } catch (err) {
      console.error("Error Cancel Open Table:", err);
      alert('Gagal membatalkan open table: ' + err.message);
    }
  };

  // 3. CART HANDLERS
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

  // 4. CONFIRM ORDER DINE-IN
  const handleConfirmOrder = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    if (cart.length === 0) return alert('Keranjang pesanan masih kosong!');

    try {
      // Ambil Active Order ID dengan limit 1 agar tidak crash jika data ganda
      const { data: activeOrders, error: orderErr } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableId)
        .eq('order_type', 'dine-in')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (orderErr) throw orderErr;

      if (!activeOrders || activeOrders.length === 0) {
        return alert('Sesi order meja tidak ditemukan! Silakan Cancel Open Table lalu Open Table kembali.');
      }

      const activeOrderId = activeOrders[0].id;

      // Buat Order Batch Baru
      const { data: batchData, error: batchErr } = await supabase
        .from('order_batches')
        .insert([{ order_id: activeOrderId }])
        .select()
        .single();

      if (batchErr) throw batchErr;

      // Masukkan Item Pesanan ke Order Items
      const itemsToInsert = cart.map(item => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'food'
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // Kosongkan Draft Cart Meja Ini
      setCurrentCart(prev => ({ ...prev, [tableId]: [] }));
      fetchActiveOrders();

      alert('Order berhasil dikonfirmasi & dikirim ke Printer Dapur!');
    } catch (err) {
      console.error("Error Confirm Order:", err);
      alert('Gagal Confirm Order: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  // 5. RECAP DINE-IN
  const getTableRecap = (tableId) => {
    const batches = confirmedOrders[tableId] || [];
    const recapMap = {};

    batches.forEach(b => {
      (b.items || []).forEach(it => {
        if (recapMap[it.menu_name || it.name]) {
          recapMap[it.menu_name || it.name].qty += it.qty;
        } else {
          recapMap[it.menu_name || it.name] = { ...it, name: it.menu_name || it.name };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const subTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount ? calculateAutoDiscount(recapList) : 0;
    const finalTotal = subTotal - autoDiscount;

    return { recapList, subTotal, autoDiscount, finalTotal, batches };
  };

  // 6. TRIGGER CLOSE TABLE BUTTON
  const handleCloseTableClick = () => {
    if (!selectedTable) return;
    const { finalTotal, batches } = getTableRecap(selectedTable.id);

    if (finalTotal === 0 || batches.length === 0) {
      const confirmClose = confirm("Tidak ada tagihan pada meja ini. Tutup dan kosongkan meja sekarang?");
      if (confirmClose) {
        handlePaymentSuccess(true);
      }
    } else {
      setShowCheckoutModal(true);
    }
  };

  // 7. CLOSE TABLE & PAYMENT SUCCESS
  const handlePaymentSuccess = async (isZeroPayment = false) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const sessionId = activeSessions[tableId];
    const { subTotal, autoDiscount, finalTotal } = getTableRecap(tableId);

    try {
      // Update Status Order menjadi Lunas & Completed
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          subtotal: subTotal,
          discount: autoDiscount,
          total_amount: finalTotal,
          is_paid: true,
          status: 'completed'
        })
        .eq('table_id', tableId)
        .eq('status', 'active');

      if (orderErr) throw orderErr;

      // Tutup Sesi Meja
      if (sessionId) {
        await supabase.from('table_sessions').update({ status: 'closed' }).eq('id', sessionId);
      }

      // Set Status Meja Kembali Available
      await supabase.from('tables').update({ status: 'available' }).eq('id', tableId);

      // Kosongkan Cart Lokal
      setCurrentCart(prev => {
        const n = { ...prev };
        delete n[tableId];
        return n;
      });

      fetchTables();
      fetchActiveOrders();

      if (!isZeroPayment) {
        alert('Pembayaran Sukses! Struk Berhasil Dicetak.');
      }

      setSelectedTable(prev => ({ ...prev, status: 'available' }));
      setShowCheckoutModal(false);
    } catch (err) {
      console.error("Error Payment/Close Table:", err);
      alert('Gagal menutup meja: ' + err.message);
    }
  };
  // --- 5. Alur Operasional Takeaway (CONNECTED TO SUPABASE) ---
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

  // FITUR 3: CONFIRM ORDER TAKEAWAY (SUPABASE REALTIME)
  const handleConfirmTakeawayOrder = async () => {
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
    const totalAmount = Math.max(0, subTotal - autoDiscount);

    // 1. Simpan Order Utama Takeaway ke Supabase
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert([{
        order_type: 'takeaway',
        order_no: generatedOrderNo,
        platform: takeawayPlatform,
        customer_name: takeawayCustomerName || 'Pelanggan',
        subtotal: subTotal,
        discount: autoDiscount,
        total_amount: totalAmount,
        is_paid: false,
        status: 'active'
      }])
      .select()
      .single();

    if (orderErr) return alert('Gagal menyimpan order takeaway: ' + orderErr.message);

    // 2. Simpan Item Pesanan
    const itemsToInsert = takeawayCart.map(item => ({
      order_id: orderData.id,
      menu_id: item.id,
      menu_name: item.name,
      price: item.price,
      qty: item.qty,
      category: item.category || 'food'
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);

    if (itemsErr) return alert('Gagal menyimpan item takeaway: ' + itemsErr.message);

    setTakeawayCart([]);
    setTakeawayCustomerName('');
    setTakeawayOrderNoInput('');
    fetchActiveOrders();

    alert(`Order ${generatedOrderNo} Berhasil Dikonfirmasi & Dicetak ke Dapur! Silakan buat orderan berikutnya.`);
  };

  // FITUR 4: CONFIRM PAYMENT TAKEAWAY (SUPABASE REALTIME)
  const handlePayTakeaway = async (order) => {
    const { error } = await supabase
      .from('orders')
      .update({ is_paid: true })
      .eq('id', order.id);

    if (error) return alert('Gagal konfirmasi pembayaran: ' + error.message);

    setShowTakeawayPaymentModal(false);
    fetchActiveOrders();
    alert(`Pembayaran Order ${order.orderNo} Sukses & Struk Dicetak! Status: Menunggu Driver/Pelanggan Mengambil.`);
  };

  // FITUR 5: SELESAIKAN ORDER TAKEAWAY (SUPABASE REALTIME)
  const handleCompleteTakeaway = async (orderId) => {
    if (confirm('Selesaikan & keluarkan orderan ini dari daftar antrean?')) {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderId);

      if (error) return alert('Gagal menyelesaikan order: ' + error.message);

      fetchActiveOrders();
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

      {/* Mode Owner */}
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
              {menuList.length === 0 ? (
                <p style={styles.mutedText}>Belum ada menu di database Supabase.</p>
              ) : (
                menuList.map(item => (
                  <div key={item.id} style={styles.cartRow}>
                    <div style={{ flex: 1 }}>
                      <strong>{item.name}</strong> - <span style={{ color: '#34d399' }}>Rp {Number(item.price).toLocaleString()}</span> ({item.category})
                    </div>
                    <button style={{ ...styles.roleBtn, color: '#f59e0b', marginRight: '8px' }} onClick={() => handleEditMenuClick(item)}>Edit</button>
                    <button style={styles.deleteBtn} onClick={() => handleDeleteMenu(item.id)}>Hapus</button>
                  </div>
                ))
              )}
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
                  <option key={m.id} value={m.id}>{m.name} (Rp {Number(m.price).toLocaleString()})</option>
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
        /* Mode Kasir */
        <div style={styles.mainLayout}>
          
          {posMode === 'dine-in' ? (
            /* ================= DINE-IN MODE ================= */
            <>
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
                              <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>Rp {Number(menu.price).toLocaleString()}</div>
                            </div>
                            <button style={styles.addMenuBtn}>+</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                                    <small style={{ color: '#9ca3af' }}>Rp {Number(item.price).toLocaleString()} x {item.qty}</small>
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
                          onClick={handleCloseTableClick}
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
              <div style={styles.leftPanel}>
                <h3 style={styles.sectionTitle}>Pesan Takeaway / Online Order</h3>
                
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

                <div style={styles.menuGrid}>
                  {menuList.map(menu => (
                    <div key={menu.id} style={styles.menuCard} onClick={() => handleAddToTakeawayCart(menu)}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
                        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>Rp {Number(menu.price).toLocaleString()}</div>
                      </div>
                      <button style={styles.addMenuBtn}>+</button>
                    </div>
                  ))}
                </div>
              </div>

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
                          <small style={{ color: '#9ca3af' }}>Rp {Number(item.price).toLocaleString()} x {item.qty}</small>
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

      {/* Modal PIN / Password */}
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
              <button style={{ ...styles.primaryBtn, flex: 2, background: '#10b981' }} onClick={() => handlePaymentSuccess(false)}>
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
