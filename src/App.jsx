import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './supabaseClient';
import CustomerOrder from './CustomerOrder';

export default function App() {
  // --- Fullscreen Setup ---
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

  // --- Self Order Parameter Check ---
  const [selfOrderTableId, setSelfOrderTableId] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) setSelfOrderTableId(tableParam);
  }, []);

  // --- Auth Role State ---
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

  // --- Main Data States ---
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuList, setMenuList] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [masterOptions, setMasterOptions] = useState([]);

  // --- Active Order States ---
  const [activeSessions, setActiveSessions] = useState({});
  const [confirmedOrders, setConfirmedOrders] = useState({});
  const [takeawayOrders, setTakeawayOrders] = useState([]);

  // --- State Modal POS Kasir (Dine-In & Takeaway) ---
  const [showPosOptionModal, setShowPosOptionModal] = useState(false);
  const [posSelectedItem, setPosSelectedItem] = useState(null);
  const [posTargetMode, setPosTargetMode] = useState('dine-in'); // 'dine-in' | 'takeaway'
  const [posSelectedOptions, setPosSelectedOptions] = useState({});
  const [posNotes, setPosNotes] = useState('');
  const [posAvailableOptions, setPosAvailableOptions] = useState([]);

  // --- Form States Owner ---
  const [tableForm, setTableForm] = useState({ id: null, number: '' });
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: '' });
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [menuForm, setMenuForm] = useState({ id: null, name: '', price: '', category: '', image_url: '' });
  const [isEditingMenu, setIsEditingMenu] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [discountForm, setDiscountForm] = useState({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);

  // --- Mode POS & Order States ---
  const [posMode, setPosMode] = useState('dine-in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [currentCart, setCurrentCart] = useState(() => {
    const saved = localStorage.getItem('pos_dinein_current_cart');
    return saved ? JSON.parse(saved) : {};
  });
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

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

  // Persistence LocalStorage
  useEffect(() => { localStorage.setItem('pos_dinein_current_cart', JSON.stringify(currentCart)); }, [currentCart]);
  useEffect(() => { localStorage.setItem('pos_takeaway_counter', JSON.stringify(autoTakeawayCounter)); }, [autoTakeawayCounter]);
  useEffect(() => { localStorage.setItem('pos_draft_takeaway_cart', JSON.stringify(takeawayCart)); }, [takeawayCart]);

  // Initial Fetch & Subscriptions
  useEffect(() => {
    fetchTables();
    fetchCategories();
    fetchMenuList();
    fetchDiscountRules();
    fetchMasterOptions();
    fetchActiveOrders();

    const tSub = supabase.channel('public:tables').on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, fetchTables).subscribe();
    const cSub = supabase.channel('public:categories').on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories).subscribe();
    const mSub = supabase.channel('public:menu_list').on('postgres_changes', { event: '*', schema: 'public', table: 'menu_list' }, fetchMenuList).subscribe();
    const dSub = supabase.channel('public:discount_rules').on('postgres_changes', { event: '*', schema: 'public', table: 'discount_rules' }, fetchDiscountRules).subscribe();
    const oSub = supabase.channel('public:orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchActiveOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => fetchActiveOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchActiveOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => fetchActiveOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(tSub);
      supabase.removeChannel(cSub);
      supabase.removeChannel(mSub);
      supabase.removeChannel(dSub);
      supabase.removeChannel(oSub);
    };
  }, []);

  const fetchTables = async () => {
    const { data } = await supabase.from('tables').select('*').order('id', { ascending: true });
    if (data) {
      setTables(data);
      setSelectedTable(prev => prev ? (data.find(t => Number(t.id) === Number(prev.id)) || prev) : null);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('id', { ascending: true });
    if (data) setCategories(data);
  };

  const fetchMenuList = async () => {
    const { data } = await supabase.from('menu_list').select('*').order('id', { ascending: true });
    if (data) setMenuList(data);
  };

  const fetchMasterOptions = async () => {
    const { data } = await supabase.from('menu_options').select('*');
    if (data) setMasterOptions(data);
  };

  const fetchDiscountRules = async () => {
    const { data } = await supabase.from('discount_rules').select('*').order('id', { ascending: true });
    if (data) {
      const formatted = data.map(i => ({
        id: i.id, menuId: Number(i.menu_id), menuName: i.menu_name, minQty: Number(i.min_qty), discountAmount: Number(i.discount_amount)
      }));
      setDiscountRules(formatted);
      fetchActiveOrders(formatted);
    }
  };

  const calculateAutoDiscount = (recapList, rules = discountRules) => {
    let totalDiscount = 0;
    if (!rules || rules.length === 0) return 0;
    recapList.forEach(item => {
      const matched = rules.filter(r => Number(r.menuId) === Number(item.id) && item.qty >= r.minQty);
      matched.forEach(r => {
        totalDiscount += Math.floor(item.qty / r.minQty) * r.discountAmount;
      });
    });
    return totalDiscount;
  };

  const fetchActiveOrders = async (currentRules = discountRules) => {
    const { data: openSessions } = await supabase.from('table_sessions').select('*').eq('status', 'open');
    const sessionsMap = {};
    if (openSessions) openSessions.forEach(s => { sessionsMap[s.table_id] = s.id; });
    setActiveSessions(sessionsMap);

    const { data: dineInOrders } = await supabase
      .from('orders')
      .select(`
        id, table_id, session_id, created_at,
        order_batches (
          id, created_at,
          order_items ( id, menu_id, menu_name, price, qty, category, options, notes )
        )
      `)
      .eq('order_type', 'dine-in')
      .eq('status', 'active');

    const confirmedMap = {};
    if (dineInOrders) {
      dineInOrders.forEach(ord => {
        const batches = (ord.order_batches || []).map(b => ({
          batchId: b.id,
          time: new Date(b.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          items: (b.order_items || []).map(it => ({
            id: Number(it.menu_id), name: it.menu_name, price: Number(it.price), qty: Number(it.qty), options: it.options || {}, notes: it.notes || ''
          }))
        }));
        confirmedMap[ord.table_id] = batches;
      });
    }
    setConfirmedOrders(confirmedMap);

    const { data: takeaways } = await supabase
      .from('orders')
      .select(`*, order_items ( id, menu_id, menu_name, price, qty, category, options, notes )`)
      .eq('order_type', 'takeaway')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (takeaways) {
      const formatted = takeaways.map(t => {
        const items = (t.order_items || []).map(it => ({
          id: Number(it.menu_id), name: it.menu_name, price: Number(it.price), qty: Number(it.qty), options: it.options || {}, notes: it.notes || ''
        }));
        const subTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const discount = t.is_paid ? (Number(t.discount) || 0) : calculateAutoDiscount(items, currentRules);
        return {
          id: t.id, orderNo: t.order_no, platform: t.platform, customerName: t.customer_name || 'Pelanggan',
          subTotal, discount, total: Math.max(0, subTotal - discount), isPaid: Boolean(t.is_paid),
          time: new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), items
        };
      });
      setTakeawayOrders(formatted);
    }
  };

  // --- Handler Modal Opsi POS Kasir ---
  const handleOpenPosModal = (menuItem, mode = 'dine-in') => {
    setPosSelectedItem(menuItem);
    setPosTargetMode(mode);
    setPosNotes('');

    const catObj = categories.find(c => c.name === menuItem.category);
    const allowed = catObj?.allowed_options || [];
    const filteredOpts = masterOptions.filter(o => allowed.includes(o.title));
    setPosAvailableOptions(filteredOpts);

    const init = {};
    filteredOpts.forEach(o => {
      if (o.values && o.values.length > 0) init[o.title] = o.values[0];
    });
    setPosSelectedOptions(init);
    setShowPosOptionModal(true);
  };

  const handleConfirmPosItem = () => {
    if (!posSelectedItem) return;

    const cartKey = `${posSelectedItem.id}-${JSON.stringify(posSelectedOptions)}-${posNotes}`;
    const newItem = {
      ...posSelectedItem,
      options: posSelectedOptions,
      notes: posNotes,
      cartKey
    };

    if (posTargetMode === 'dine-in') {
      if (!selectedTable || selectedTable.status !== 'occupied') return alert('Buka meja terlebih dahulu!');
      const tableId = selectedTable.id;
      const cart = currentCart[tableId] || [];

      const existingIndex = cart.findIndex(item => item.cartKey === cartKey);
      if (existingIndex > -1) {
        const updated = cart.map((item, idx) => idx === existingIndex ? { ...item, qty: item.qty + 1 } : item);
        setCurrentCart(prev => ({ ...prev, [tableId]: updated }));
      } else {
        setCurrentCart(prev => ({ ...prev, [tableId]: [...cart, { ...newItem, qty: 1 }] }));
      }
    } else {
      const existingIndex = takeawayCart.findIndex(item => item.cartKey === cartKey);
      if (existingIndex > -1) {
        setTakeawayCart(takeawayCart.map((item, idx) => idx === existingIndex ? { ...item, qty: item.qty + 1 } : item));
      } else {
        setTakeawayCart([...takeawayCart, { ...newItem, qty: 1 }]);
      }
    }

    setShowPosOptionModal(false);
    setPosSelectedItem(null);
  };

  // --- CRUD Owner Handlers ---
  const handleToggleCategoryOption = async (categoryObj, optionTitle) => {
    const current = categoryObj.allowed_options || [];
    const nextOptions = current.includes(optionTitle)
      ? current.filter(o => o !== optionTitle)
      : [...current, optionTitle];

    const { error } = await supabase.from('categories').update({ allowed_options: nextOptions }).eq('id', categoryObj.id);
    if (!error) fetchCategories();
  };

  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!tableForm.number.trim()) return;
    if (isEditingTable) {
      await supabase.from('tables').update({ number: tableForm.number }).eq('id', tableForm.id);
      setIsEditingTable(false);
    } else {
      await supabase.from('tables').insert([{ number: tableForm.number, status: 'available' }]);
    }
    setTableForm({ id: null, number: '' });
    fetchTables();
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return;
    if (isEditingCategory) {
      await supabase.from('categories').update({ name: categoryForm.name.trim() }).eq('id', categoryForm.id);
      setIsEditingCategory(false);
    } else {
      await supabase.from('categories').insert([{ name: categoryForm.name.trim() }]);
    }
    setCategoryForm({ id: null, name: '' });
    fetchCategories();
  };

  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!menuForm.name || !menuForm.price) return alert('Isi data menu!');
    const payload = {
      name: menuForm.name,
      price: Number(menuForm.price),
      category: menuForm.category || categories[0]?.name || 'Makanan',
      image_url: menuForm.image_url
    };
    if (isEditingMenu) {
      await supabase.from('menu_list').update(payload).eq('id', menuForm.id);
      setIsEditingMenu(false);
    } else {
      await supabase.from('menu_list').insert([payload]);
    }
    setMenuForm({ id: null, name: '', price: '', category: categories[0]?.name || '', image_url: '' });
    fetchMenuList();
  };

  // --- Operational POS Handlers ---
  const handleOpenTable = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const { data: sessionData } = await supabase.from('table_sessions').insert([{ table_id: tableId, status: 'open' }]).select().single();
    await supabase.from('orders').insert([{ session_id: sessionData.id, table_id: tableId, order_type: 'dine-in', status: 'active' }]);
    await supabase.from('tables').update({ status: 'occupied' }).eq('id', tableId);
    fetchTables();
    fetchActiveOrders();
  };

  const handleConfirmOrder = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    if (cart.length === 0) return alert('Keranjang kosong!');

    try {
      const { data: activeOrders } = await supabase
        .from('orders').select('id').eq('table_id', tableId).eq('order_type', 'dine-in').eq('status', 'active').limit(1);

      if (!activeOrders || activeOrders.length === 0) return alert('Buka meja terlebih dahulu!');

      const activeOrderId = activeOrders[0].id;
      const { data: batchData } = await supabase.from('order_batches').insert([{ order_id: activeOrderId }]).select().single();

      const itemsToInsert = cart.map(item => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
        options: item.options || {},
        notes: item.notes || ''
      }));

      await supabase.from('order_items').insert(itemsToInsert);
      setCurrentCart(prev => ({ ...prev, [tableId]: [] }));
      fetchActiveOrders();
      alert('Order berhasil dikirim ke Printer Dapur!');
    } catch (err) {
      alert('Gagal Confirm Order: ' + err.message);
    }
  };

  const getTableRecap = (tableId) => {
    const batches = confirmedOrders[tableId] || [];
    const recapMap = {};

    batches.forEach(b => {
      (b.items || []).forEach(it => {
        const itemKey = `${it.name}-${JSON.stringify(it.options)}-${it.notes}`;
        if (recapMap[itemKey]) {
          recapMap[itemKey].qty += it.qty;
        } else {
          recapMap[itemKey] = { ...it };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const subTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount(recapList);
    return { recapList, subTotal, autoDiscount, finalTotal: Math.max(0, subTotal - autoDiscount), batches };
  };

  const handlePaymentSuccess = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const { subTotal, autoDiscount, finalTotal } = getTableRecap(tableId);

    await supabase.from('orders').update({ subtotal: subTotal, discount: autoDiscount, total_amount: finalTotal, is_paid: true, status: 'completed' })
      .eq('table_id', tableId).eq('status', 'active');
    await supabase.from('table_sessions').update({ status: 'closed' }).eq('id', activeSessions[tableId]);
    await supabase.from('tables').update({ status: 'available' }).eq('id', tableId);

    setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });
    setShowCheckoutModal(false);
    fetchTables();
    fetchActiveOrders();
    alert('Pembayaran Berhasil!');
  };

  const handleConfirmTakeawayOrder = async () => {
    if (takeawayCart.length === 0) return alert('Keranjang Takeaway kosong!');
    const generatedOrderNo = takeawayPlatform === 'On Site' ? `#${String(autoTakeawayCounter).padStart(3, '0')}` : `#${takeawayOrderNoInput.trim()}`;
    if (takeawayPlatform === 'On Site') setAutoTakeawayCounter(prev => prev + 1);

    const subTotal = takeawayCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount(takeawayCart);

    const { data: orderData } = await supabase.from('orders').insert([{
      order_type: 'takeaway', order_no: generatedOrderNo, platform: takeawayPlatform,
      customer_name: takeawayCustomerName || 'Pelanggan', subtotal: subTotal, discount: autoDiscount,
      total_amount: Math.max(0, subTotal - autoDiscount), is_paid: false, status: 'active'
    }]).select().single();

    const itemsToInsert = takeawayCart.map(item => ({
      order_id: orderData.id, menu_id: item.id, menu_name: item.name, price: item.price, qty: item.qty,
      category: item.category || 'Makanan', options: item.options || {}, notes: item.notes || ''
    }));

    await supabase.from('order_items').insert(itemsToInsert);
    setTakeawayCart([]);
    setTakeawayCustomerName('');
    setTakeawayOrderNoInput('');
    fetchActiveOrders();
    alert(`Order ${generatedOrderNo} berhasil dikirim ke Dapur!`);
  };

  // Calculations Dine-In
  const activeTableId = selectedTable?.id;
  const activeTableStatus = selectedTable?.status;
  const cartItems = activeTableId ? (currentCart[activeTableId] || []) : [];
  const { recapList, subTotal, autoDiscount, batches, finalTotal } = activeTableId ? getTableRecap(activeTableId) : { recapList: [], subTotal: 0, autoDiscount: 0, batches: [], finalTotal: 0 };

  if (selfOrderTableId) {
    return <CustomerOrder tableId={selfOrderTableId} />;
  }

  return (
    <div style={styles.appContainer}>
      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logoBadge}>TT</div>
          <h1 style={styles.headerTitle}>TableTalk POS</h1>
          {userRole === 'cashier' && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
              <button style={posMode === 'dine-in' ? styles.activeModeNavBtn : styles.modeNavBtn} onClick={() => setPosMode('dine-in')}>🍽️ Dine-In</button>
              <button style={posMode === 'takeaway' ? styles.activeModeNavBtn : styles.modeNavBtn} onClick={() => setPosMode('takeaway')}>🛵 Takeaway</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={userRole === 'cashier' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => handleRoleChangeRequest('cashier')}>Kasir Mode</button>
          <button style={userRole === 'owner' ? styles.activeRoleBtn : styles.roleBtn} onClick={() => handleRoleChangeRequest('owner')}>Owner Mode</button>
        </div>
      </header>

      {userRole === 'owner' ? (
        /* ================= OWNER MODE ================= */
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <h2>Panel Owner - Pengaturan Sistem</h2>

          {/* Pengaturan Kategori & Opsi Ice/Sugar */}
          <div style={styles.ownerCard}>
            <h3>Pengaturan Kategori & Fitur Opsi (Ice / Sugar Level)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categories.map(cat => (
                <div key={cat.id} style={{ borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#38bdf8' }}>{cat.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>Opsi yang diaktifkan untuk kategori ini:</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {masterOptions.map(opt => {
                      const isChecked = (cat.allowed_options || []).includes(opt.title);
                      return (
                        <label key={opt.id} style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleCategoryOption(cat, opt.title)}
                          />
                          {opt.title}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kelola Menu */}
          <div style={styles.ownerCard}>
            <h3>{isEditingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h3>
            <form onSubmit={handleSaveMenu} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input type="text" placeholder="Nama Menu" value={menuForm.name} onChange={e => setMenuForm({ ...menuForm, name: e.target.value })} style={styles.inputField} />
              <input type="number" placeholder="Harga (Rp)" value={menuForm.price} onChange={e => setMenuForm({ ...menuForm, price: e.target.value })} style={styles.inputField} />
              <select value={menuForm.category} onChange={e => setMenuForm({ ...menuForm, category: e.target.value })} style={styles.inputField}>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <button type="submit" style={styles.primaryBtn}>{isEditingMenu ? 'Simpan' : '+ Tambah Menu'}</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {menuList.map(item => (
                <div key={item.id} style={styles.cartRow}>
                  <div style={{ flex: 1 }}><strong>{item.name}</strong> - Rp {Number(item.price).toLocaleString()} ({item.category})</div>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b' }} onClick={() => { setMenuForm(item); setIsEditingMenu(true); }}>Edit</button>
                  <button style={styles.deleteBtn} onClick={async () => { await supabase.from('menu_list').delete().eq('id', item.id); fetchMenuList(); }}>Hapus</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ================= KASIR MODE ================= */
        <div style={styles.mainLayout}>
          {posMode === 'dine-in' ? (
            <>
              {/* Dine-In Left Panel */}
              <div style={styles.leftPanel}>
                <h3 style={styles.sectionTitle}>Status Meja</h3>
                <div style={styles.tableGrid}>
                  {tables.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTable(t)}
                      style={{
                        ...styles.tableCard,
                        borderColor: selectedTable?.id === t.id ? '#3b82f6' : t.status === 'occupied' ? '#ef4444' : '#374151',
                        background: selectedTable?.id === t.id ? '#1e293b' : '#111827',
                      }}
                    >
                      <strong>{t.number}</strong>
                      <span style={{ ...styles.statusBadge, color: t.status === 'occupied' ? '#f87171' : '#34d399' }}>
                        {t.status === 'occupied' ? 'Terisi' : 'Kosong'}
                      </span>
                    </div>
                  ))}
                </div>

                {selectedTable && (
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={styles.sectionTitle}>Menu ({selectedTable.number})</h3>
                    {activeTableStatus === 'available' ? (
                      <button style={styles.primaryBtn} onClick={handleOpenTable}>Open Table</button>
                    ) : (
                      <div style={styles.menuGrid}>
                        {menuList.map(menu => (
                          <div key={menu.id} style={styles.menuCard} onClick={() => handleOpenPosModal(menu, 'dine-in')}>
                            <div>
                              <div style={{ fontWeight: '600' }}>{menu.name}</div>
                              <div style={{ fontSize: '11px', color: '#60a5fa' }}>{menu.category}</div>
                              <div style={{ fontSize: '13px' }}>Rp {Number(menu.price).toLocaleString()}</div>
                            </div>
                            <button style={styles.addMenuBtn}>+</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dine-In Right Panel (Rekap Order) */}
              <div style={styles.rightPanel}>
                {!selectedTable ? (
                  <div style={styles.emptyStateContainer}><p>Pilih meja terlebih dahulu</p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h3>{selectedTable.number} - Rekap Order</h3>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {/* Draft Cart */}
                      <div style={styles.sectionBlock}>
                        <h4 style={styles.subTitle}>Draft Input Baru</h4>
                        {cartItems.map((item, idx) => (
                          <div key={idx} style={styles.cartRow}>
                            <div style={{ flex: 1 }}>
                              <div>{item.qty}x <strong>{item.name}</strong></div>
                              {item.options && Object.keys(item.options).length > 0 && (
                                <div style={{ fontSize: '11px', color: '#60a5fa' }}>{Object.values(item.options).join(' • ')}</div>
                              )}
                              {item.notes && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Note: {item.notes}</div>}
                            </div>
                            <div>Rp {(item.price * item.qty).toLocaleString()}</div>
                          </div>
                        ))}
                        {cartItems.length > 0 && (
                          <button style={styles.confirmOrderBtn} onClick={handleConfirmOrder}>Kirim ke Printer Dapur</button>
                        )}
                      </div>

                      {/* Riwayat Order Dapur */}
                      <div style={styles.sectionBlock}>
                        <h4 style={styles.subTitle}>Sudah Dikirim ke Dapur</h4>
                        {batches.map((b, i) => (
                          <div key={b.batchId} style={styles.batchCard}>
                            <div style={styles.batchHeader}>Batch #{i + 1} - Jam {b.time}</div>
                            {b.items.map((it, idx) => (
                              <div key={idx} style={{ marginTop: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                  <span>{it.qty}x {it.name}</span>
                                  <span>Rp {(it.price * it.qty).toLocaleString()}</span>
                                </div>
                                {it.options && Object.keys(it.options).length > 0 && (
                                  <div style={{ fontSize: '11px', color: '#60a5fa' }}>{Object.values(it.options).join(' • ')}</div>
                                )}
                                {it.notes && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Note: {it.notes}</div>}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={styles.paymentFooter}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                        <span>Total:</span>
                        <span style={{ color: '#10b981' }}>Rp {finalTotal.toLocaleString()}</span>
                      </div>
                      <button style={{ ...styles.primaryBtn, width: '100%', marginTop: '10px' }} onClick={handlePaymentSuccess}>Close Table & Payment</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Takeaway Mode */
            <>
              <div style={styles.leftPanel}>
                <h3>Takeaway / Online Order</h3>
                <div style={styles.menuGrid}>
                  {menuList.map(menu => (
                    <div key={menu.id} style={styles.menuCard} onClick={() => handleOpenPosModal(menu, 'takeaway')}>
                      <div>
                        <div>{menu.name}</div>
                        <div style={{ fontSize: '12px', color: '#34d399' }}>Rp {Number(menu.price).toLocaleString()}</div>
                      </div>
                      <button style={styles.addMenuBtn}>+</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.rightPanel}>
                <h3>Antrean Takeaway</h3>
                {takeawayCart.length > 0 && (
                  <button style={styles.confirmOrderBtn} onClick={handleConfirmTakeawayOrder}>Simpan & Cetak Label Dapur</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Opsi & Notes Kasir POS */}
      {showPosOptionModal && posSelectedItem && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3>Opsi: {posSelectedItem.name}</h3>
            {posAvailableOptions.map(opt => (
              <div key={opt.id} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>{opt.title}:</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(opt.values || []).map(val => (
                    <button
                      key={val}
                      onClick={() => setPosSelectedOptions({ ...posSelectedOptions, [opt.title]: val })}
                      style={{
                        padding: '6px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid #334155',
                        backgroundColor: posSelectedOptions[opt.title] === val ? '#2563eb' : '#0f172a',
                        color: posSelectedOptions[opt.title] === val ? '#fff' : '#94a3b8'
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Notes Opsional:</label>
              <input
                type="text"
                placeholder="Catatan pesanan..."
                value={posNotes}
                onChange={e => setPosNotes(e.target.value)}
                style={{ ...styles.inputField, width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.dangerOutlineBtn} onClick={() => setShowPosOptionModal(false)}>Batal</button>
              <button style={styles.primaryBtn} onClick={handleConfirmPosItem}>Tambahkan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Auth PIN */}
      {showAuthModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3>Masukkan PIN Mode {targetRole === 'owner' ? 'Owner' : 'Kasir'}</h3>
            <form onSubmit={handleVerifyPin}>
              <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} style={{ ...styles.inputField, width: '100%', marginBottom: '12px' }} autoFocus />
              <button type="submit" style={{ ...styles.primaryBtn, width: '100%' }}>Masuk</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: { height: '100vh', width: '100vw', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' },
  header: { height: '56px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' },
  logoBadge: { width: '32px', height: '32px', backgroundColor: '#3b82f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  headerTitle: { fontSize: '18px', margin: 0 },
  roleBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px 12px', cursor: 'pointer' },
  activeRoleBtn: { background: '#334155', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' },
  modeNavBtn: { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' },
  activeModeNavBtn: { background: '#2563eb', border: 'none', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' },
  mainLayout: { flex: 1, display: 'flex', overflow: 'hidden' },
  leftPanel: { flex: 2, padding: '20px', overflowY: 'auto', borderRight: '1px solid #334155' },
  rightPanel: { flex: 1.1, padding: '20px', backgroundColor: '#1e293b', display: 'flex', flexDirection: 'column' },
  sectionTitle: { fontSize: '15px', margin: 0 },
  tableGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px', marginTop: '12px' },
  tableCard: { padding: '12px', borderRadius: '10px', border: '2px solid', cursor: 'pointer', textAlign: 'center' },
  statusBadge: { fontSize: '11px', display: 'block', marginTop: '4px' },
  menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginTop: '12px' },
  menuCard: { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
  addMenuBtn: { width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  emptyStateContainer: { display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  sectionBlock: { marginBottom: '16px' },
  subTitle: { fontSize: '12px', textTransform: 'uppercase', color: '#94a3b8' },
  cartRow: { display: 'flex', alignItems: 'center', background: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '6px' },
  deleteBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' },
  confirmOrderBtn: { width: '100%', padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' },
  batchCard: { background: '#0f172a', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #3b82f6', marginBottom: '8px' },
  batchHeader: { fontSize: '11px', color: '#94a3b8' },
  paymentFooter: { marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #334155' },
  primaryBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 'bold', cursor: 'pointer' },
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' },
  inputField: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', backgroundColor: '#0f172a', color: '#fff', boxSizing: 'border-box' },
  ownerCard: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '16px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', width: '380px', boxSizing: 'border-box' }
};
