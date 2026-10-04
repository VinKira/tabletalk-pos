import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './supabaseClient';
import CustomerOrder from './CustomerOrder';

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

  // --- Detection URL Parameters (Self Order Customer Mode) ---
  const [selfOrderTableId, setSelfOrderTableId] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      setSelfOrderTableId(tableParam);
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

  // --- Dynamic Data States (Connected to Supabase Realtime) ---
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuList, setMenuList] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);

  // TAMBAHAN STEP 1: Ice & Sugar Level States
  const [iceLevels, setIceLevels] = useState([]);
  const [sugarLevels, setSugarLevels] = useState([]);
  const [selectedIceCategories, setSelectedIceCategories] = useState([]); // array category_id
  const [selectedSugarCategories, setSelectedSugarCategories] = useState([]); // array category_id

  const [iceForm, setIceForm] = useState({ id: null, name: '' });
  const [isEditingIce, setIsEditingIce] = useState(false);

  const [sugarForm, setSugarForm] = useState({ id: null, name: '' });
  const [isEditingSugar, setIsEditingSugar] = useState(false);
  // --- State Pesanan Supabase Realtime ---
  const [activeSessions, setActiveSessions] = useState({}); // { [tableId]: session_id }
  const [confirmedOrders, setConfirmedOrders] = useState({}); // { [tableId]: [batches] }
  const [takeawayOrders, setTakeawayOrders] = useState([]); // [array of takeaway orders]

  // TAMBAHAN STEP 2: State Modal Pilihan Ice & Sugar Level
  const [showOptionModal, setShowOptionModal] = useState(false);
  const [pendingMenuItem, setPendingMenuItem] = useState(null);
  const [selectedIceOption, setSelectedIceOption] = useState('');
  const [selectedSugarOption, setSelectedSugarOption] = useState('');
  const [optionTargetMode, setOptionTargetMode] = useState('dine-in'); // 'dine-in' | 'takeaway'
  
  // Handler Download QR Code Meja
  const handleDownloadQR = (tableNumber) => {
    const svgElement = document.getElementById(`qr-svg-${tableNumber}`);
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_${tableNumber.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

const calculateAutoDiscount = (recapList, rules = discountRules) => {
  let totalDiscount = 0;
  if (!rules || rules.length === 0 || !recapList || recapList.length === 0) return 0;
  
  recapList.forEach(item => {
    const targetMenuId = Number(item.menu_id || item.id);
    const matchedRules = rules.filter(r => Number(r.menuId) === targetMenuId && item.qty >= r.minQty);
    matchedRules.forEach(r => {
      const multiplier = Math.floor(item.qty / r.minQty);
      totalDiscount += multiplier * r.discountAmount;
    });
  });
  return totalDiscount;
};

  // Fetch Data Awal & Realtime Subscription Supabase
  useEffect(() => {
    fetchTables();
    fetchCategories();
    fetchMenuList();
    fetchDiscountRules();
    fetchActiveOrders();
    fetchIceLevelData();
    fetchSugarLevelData();
    
    // 1. Listen Perubahan Meja Realtime
    const tableChannel = supabase
      .channel('public:tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchTables();
      })
      .subscribe();

    // 2. Listen Perubahan Kategori Realtime
    const categoryChannel = supabase
      .channel('public:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        fetchCategories();
      })
      .subscribe();

    // 3. Listen Perubahan Menu Realtime
    const menuChannel = supabase
      .channel('public:menu_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_list' }, () => {
        fetchMenuList();
      })
      .subscribe();

    // 4. Listen Perubahan Promo Realtime
    const discountChannel = supabase
      .channel('public:discount_rules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discount_rules' }, () => {
        fetchDiscountRules();
      })
      .subscribe();

    // 5. Channel Realtime Ice & Sugar
    const iceChannel = supabase
      .channel('public:ice_levels_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ice_levels' }, () => fetchIceLevelData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ice_level_categories' }, () => {
        fetchIceLevelData();
        fetchCategories(); // <-- TAMBAHKAN PEMANGGILAN INI
      })
      .subscribe();

    const sugarChannel = supabase
      .channel('public:sugar_levels_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugar_levels' }, () => fetchSugarLevelData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugar_level_categories' }, () => {
        fetchSugarLevelData();
        fetchCategories(); // <-- TAMBAHKAN PEMANGGILAN INI
      })
      .subscribe();
    
    // 6. Listen Perubahan Transaksi & Order Realtime
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

    return () => {
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(categoryChannel);
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(discountChannel);
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(iceChannel);
      supabase.removeChannel(sugarChannel);
    };
  }, []);

  const fetchTables = async () => {
    const { data, error } = await supabase.from('tables').select('*').order('id', { ascending: true });
    if (!error && data) {
      setTables(data);

      setSelectedTable(prevSelected => {
        if (!prevSelected) return null;
        const updatedCurrentTable = data.find(t => Number(t.id) === Number(prevSelected.id));
        return updatedCurrentTable || prevSelected;
      });
    }
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categories').select('*').order('id', { ascending: true });
    if (!error && data) {
      setCategories(data);
      if (data.length > 0 && !menuForm.category) {
        setMenuForm(prev => ({ ...prev, category: data[0].name }));
      }
    }
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
      // Panggil fetchActiveOrders secara eksplisit dengan rule terbaru
      fetchActiveOrders(formatted);
    }
  };

// Synchronize Active Orders (Dine-In & Takeaway) from Supabase
const fetchActiveOrders = async (currentRules = null) => {
    // 0. Ambil discount rules terbaru jika tidak dipasing dari parameter
    let activeRules = currentRules;
    if (!activeRules || activeRules.length === 0) {
      const { data: rulesData } = await supabase.from('discount_rules').select('*').order('id', { ascending: true });
      if (rulesData) {
        activeRules = rulesData.map(item => ({
          id: item.id,
          menuId: Number(item.menu_id),
          menuName: item.menu_name,
          minQty: Number(item.min_qty),
          discountAmount: Number(item.discount_amount)
        }));
      } else {
        activeRules = [];
      }
    }

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

    // 1. DINE-IN ORDERS QUERY (DIPERBAIKI)
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
          order_items (
            id,
            menu_id,
            menu_name,
            price,
            qty,
            category,
            ice_level,
            sugar_level
          )
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
          type: 'Order',
          items: (b.order_items || []).map(it => ({
            id: Number(it.id),
            menu_id: Number(it.menu_id),
            name: it.menu_name,
            price: Number(it.price),
            qty: Number(it.qty),
            iceLevel: it.ice_level || '',
            sugarLevel: it.sugar_level || ''
          }))
        }));
        confirmedMap[tId] = batches;
      });
    }
    setConfirmedOrders(confirmedMap);

    // 2. TAKEAWAY ORDERS QUERY (DIPERBAIKI)
    const { data: takeaways } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          menu_id,
          menu_name,
          price,
          qty,
          category,
          ice_level,
          sugar_level
        )
      `)
      .eq('order_type', 'takeaway')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (takeaways) {
      const formattedTakeaway = takeaways.map(t => {
        const items = (t.order_items || []).map(it => ({
          id: Number(it.id),
          menu_id: Number(it.menu_id),
          name: it.menu_name,
          price: Number(it.price),
          qty: Number(it.qty),
          iceLevel: it.ice_level || '',
          sugarLevel: it.sugar_level || ''
        }));
        
        const subTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        
        // Grouping khusus promo berdasarkan menu_id (Gabungkan qty semua varian)
        const takeawayPromoMap = {};
        items.forEach(it => {
          const targetId = Number(it.menu_id || it.id);
          if (takeawayPromoMap[targetId]) {
            takeawayPromoMap[targetId].qty += Number(it.qty);
          } else {
            takeawayPromoMap[targetId] = {
              menu_id: targetId,
              qty: Number(it.qty)
            };
          }
        });
        
        const calculatedDiscount = calculateAutoDiscount(Object.values(takeawayPromoMap), activeRules);
        const discount = t.is_paid ? (Number(t.discount) || 0) : calculatedDiscount;
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
  };

  // State Form Owner Mode
  const [tableForm, setTableForm] = useState({ id: null, number: '' });
  const [isEditingTable, setIsEditingTable] = useState(false);

  const [categoryForm, setCategoryForm] = useState({ id: null, name: '' });
  const [isEditingCategory, setIsEditingCategory] = useState(false);

  const [menuForm, setMenuForm] = useState({ id: null, name: '', price: '', category: '', image_url: '' });
  const [isEditingMenu, setIsEditingMenu] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [discountForm, setDiscountForm] = useState({ id: null, menuId: '', minQty: 1, discountAmount: 0 });
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);

  // --- POS Mode Selection ---
  const [posMode, setPosMode] = useState('dine-in');

  // --- Dine-In State ---
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

  // --- Self-Order Cart State (Pelanggan) ---
  const [selfOrderCart, setSelfOrderCart] = useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Semua');

  // TAMBAHKAN LINE INI (State filter kategori untuk Kasir Dine-In & Takeaway):
  const [cashierCategoryFilter, setCashierCategoryFilter] = useState('Semua');
  
  // Auto-Save Local Storage
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
      const { error } = await supabase.from('tables').update({ number: tableForm.number }).eq('id', tableForm.id);
      if (error) alert('Gagal update meja: ' + error.message);
      else { setIsEditingTable(false); fetchTables(); }
    } else {
      const { error } = await supabase.from('tables').insert([{ number: tableForm.number, status: 'available' }]);
      if (error) alert('Gagal tambah meja: ' + error.message);
      else fetchTables();
    }
    setTableForm({ id: null, number: '' });
  };

  const handleEditTableClick = (t) => { setTableForm(t); setIsEditingTable(true); };

  const handleDeleteTable = async (id) => {
    if (confirm('Yakin ingin menghapus meja ini beserta seluruh riwayat transaksinya?')) {
      try {
        const { data: relatedOrders } = await supabase
          .from('orders')
          .select('id')
          .eq('table_id', id);

        if (relatedOrders && relatedOrders.length > 0) {
          const orderIds = relatedOrders.map(o => o.id);
          await supabase.from('order_items').delete().in('order_id', orderIds);
          await supabase.from('order_batches').delete().in('order_id', orderIds);
          await supabase.from('orders').delete().eq('table_id', id);
        }

        await supabase.from('table_sessions').delete().eq('table_id', id);

        const { error } = await supabase.from('tables').delete().eq('id', id);
        if (error) throw error;

        if (selectedTable?.id === id) setSelectedTable(null);
        fetchTables();
      } catch (error) {
        alert('Gagal hapus meja: ' + error.message);
      }
    }
  };

  // --- 2. Manajemen Kategori CRUD ---
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return alert('Nama Kategori wajib diisi!');

    if (isEditingCategory) {
      const { error } = await supabase.from('categories').update({ name: categoryForm.name.trim() }).eq('id', categoryForm.id);
      if (error) alert('Gagal update kategori: ' + error.message);
      else { setIsEditingCategory(false); fetchCategories(); }
    } else {
      const { error } = await supabase.from('categories').insert([{ name: categoryForm.name.trim() }]);
      if (error) alert('Gagal tambah kategori: ' + error.message);
      else fetchCategories();
    }
    setCategoryForm({ id: null, name: '' });
  };

  const handleEditCategoryClick = (cat) => { setCategoryForm(cat); setIsEditingCategory(true); };
  const handleDeleteCategory = async (id) => {
    if (confirm('Yakin ingin menghapus kategori ini?')) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) alert('Gagal hapus kategori: ' + error.message);
      else fetchCategories();
    }
  };

  // --- Handler Upload Gambar ke Supabase Storage ---
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `menus/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('menu-images').getPublicUrl(filePath);
      setMenuForm((prev) => ({ ...prev, image_url: data.publicUrl }));
    } catch (error) {
      alert('Gagal mengunggah gambar: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };
  
  // --- 3. Manajemen Menu CRUD ---
  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!menuForm.name || !menuForm.price) return alert('Nama dan Harga wajib diisi!');
    const categoryToSave = menuForm.category || (categories[0]?.name || 'Makanan');
    const parsedPrice = Number(menuForm.price);

    if (isEditingMenu) {
      const { error } = await supabase
        .from('menu_list')
        .update({ 
          name: menuForm.name, 
          price: parsedPrice, 
          category: categoryToSave,
          image_url: menuForm.image_url 
        })
        .eq('id', menuForm.id);

      if (error) alert('Gagal update menu: ' + error.message);
      else setIsEditingMenu(false);
    } else {
      const { error } = await supabase
        .from('menu_list')
        .insert([{ 
          name: menuForm.name, 
          price: parsedPrice, 
          category: categoryToSave,
          image_url: menuForm.image_url 
        }]);

      if (error) alert('Gagal tambah menu: ' + error.message);
    }

    setMenuForm({ id: null, name: '', price: '', category: categories[0]?.name || '', image_url: '' });
  };

  const handleEditMenuClick = (item) => { 
    setMenuForm({
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      image_url: item.image_url || ''
    }); 
    setIsEditingMenu(true); 
  };

  const handleDeleteMenu = async (id) => {
    if (confirm('Yakin ingin menghapus menu ini?')) {
      const targetMenu = menuList.find(m => m.id === id);
      if (targetMenu?.image_url) {
        const path = targetMenu.image_url.split('/menu-images/')[1];
        if (path) await supabase.storage.from('menu-images').remove([path]);
      }

      const { error } = await supabase.from('menu_list').delete().eq('id', id);
      if (error) alert('Gagal hapus menu: ' + error.message);
    }
  };

  // --- 4. Manajemen Promo Diskon CRUD ---
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

  const handleEditDiscountClick = (rule) => {
    setDiscountForm({ id: rule.id, menuId: rule.menuId, minQty: rule.minQty, discountAmount: rule.discountAmount });
    setIsEditingDiscount(true);
  };
  const handleDeleteDiscountRule = async (id) => {
    if (confirm('Hapus rule promo ini?')) {
      const { error } = await supabase.from('discount_rules').delete().eq('id', id);
      if (error) alert('Gagal hapus promo: ' + error.message);
    }
  };

  // ==========================================
  // HELPER CRUD ICE LEVEL & SUGAR LEVEL
  // ==========================================
  const fetchIceLevelData = async () => {
    const { data: levels } = await supabase.from('ice_levels').select('*').order('id', { ascending: true });
    if (levels) setIceLevels(levels);

    const { data: catMap } = await supabase.from('ice_level_categories').select('category_id');
    if (catMap) {
      const ids = catMap.map(c => Number(c.category_id));
      setSelectedIceCategories(ids);
    }
  };

  const fetchSugarLevelData = async () => {
    const { data: levels } = await supabase.from('sugar_levels').select('*').order('id', { ascending: true });
    if (levels) setSugarLevels(levels);

    const { data: catMap } = await supabase.from('sugar_level_categories').select('category_id');
    if (catMap) {
      const ids = catMap.map(c => Number(c.category_id));
      setSelectedSugarCategories(ids);
    }
  };

  const handleSaveIce = async (e) => {
    e.preventDefault();
    if (!iceForm.name.trim()) return alert('Nama Ice Level wajib diisi!');

    if (isEditingIce) {
      const { error } = await supabase.from('ice_levels').update({ name: iceForm.name.trim() }).eq('id', iceForm.id);
      if (error) alert('Gagal update: ' + error.message);
      else { setIsEditingIce(false); fetchIceLevelData(); }
    } else {
      const { error } = await supabase.from('ice_levels').insert([{ name: iceForm.name.trim() }]);
      if (error) alert('Gagal tambah: ' + error.message);
      else fetchIceLevelData();
    }
    setIceForm({ id: null, name: '' });
  };

  const handleDeleteIce = async (id) => {
    if (confirm('Hapus opsi Ice Level ini?')) {
      const { error } = await supabase.from('ice_levels').delete().eq('id', id);
      if (error) alert('Gagal hapus: ' + error.message);
      else fetchIceLevelData();
    }
  };

const handleToggleIceCategory = async (categoryId) => {
    const targetId = Number(categoryId);
    const exists = selectedIceCategories.includes(targetId);

    // Update state lokal secara instan
    if (exists) {
      setSelectedIceCategories(prev => prev.filter(id => id !== targetId));
      await supabase.from('ice_level_categories').delete().eq('category_id', targetId);
    } else {
      setSelectedIceCategories(prev => [...prev, targetId]);
      await supabase.from('ice_level_categories').insert([{ category_id: targetId }]);
    }
    fetchIceLevelData();
  };

  const handleSaveSugar = async (e) => {
    e.preventDefault();
    if (!sugarForm.name.trim()) return alert('Nama Sugar Level wajib diisi!');

    if (isEditingSugar) {
      const { error } = await supabase.from('sugar_levels').update({ name: sugarForm.name.trim() }).eq('id', sugarForm.id);
      if (error) alert('Gagal update: ' + error.message);
      else { setIsEditingSugar(false); fetchSugarLevelData(); }
    } else {
      const { error } = await supabase.from('sugar_levels').insert([{ name: sugarForm.name.trim() }]);
      if (error) alert('Gagal tambah: ' + error.message);
      else fetchSugarLevelData();
    }
    setSugarForm({ id: null, name: '' });
  };

  const handleDeleteSugar = async (id) => {
    if (confirm('Hapus opsi Sugar Level ini?')) {
      const { error } = await supabase.from('sugar_levels').delete().eq('id', id);
      if (error) alert('Gagal hapus: ' + error.message);
      else fetchSugarLevelData();
    }
  };

const handleToggleSugarCategory = async (categoryId) => {
    const targetId = Number(categoryId);
    const exists = selectedSugarCategories.includes(targetId);

    // Update state lokal secara instan
    if (exists) {
      setSelectedSugarCategories(prev => prev.filter(id => id !== targetId));
      await supabase.from('sugar_level_categories').delete().eq('category_id', targetId);
    } else {
      setSelectedSugarCategories(prev => [...prev, targetId]);
      await supabase.from('sugar_level_categories').insert([{ category_id: targetId }]);
    }
    fetchSugarLevelData();
  };
  
  // --- 5. Alur Operasional POS (Dine-In) ---
  const handleSelectTable = (table) => { setSelectedTable(table); };

  const handleOpenTable = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;

    try {
      const { data: sessionData, error: sessionErr } = await supabase
        .from('table_sessions').insert([{ table_id: tableId, status: 'open' }]).select().single();
      if (sessionErr) throw sessionErr;

      const { error: orderErr } = await supabase
        .from('orders').insert([{ session_id: sessionData.id, table_id: tableId, order_type: 'dine-in', status: 'active' }]);
      if (orderErr) throw orderErr;

      const { error: tableErr } = await supabase.from('tables').update({ status: 'occupied' }).eq('id', tableId);
      if (tableErr) throw tableErr;

      fetchTables();
      fetchActiveOrders();
      setSelectedTable(prev => ({ ...prev, status: 'occupied' }));
    } catch (err) {
      alert('Gagal Open Table: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

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
      setCurrentCart(prev => { const updated = { ...prev }; delete updated[tableId]; return updated; });

      fetchTables();
      fetchActiveOrders();
      setSelectedTable(prev => ({ ...prev, status: 'available' }));
    } catch (err) {
      alert('Gagal membatalkan open table: ' + err.message);
    }
  };

// Helper Cek Categori Has Options
const checkCategoryOptions = (menuItem) => {
  if (!menuItem) return { hasIce: false, hasSugar: false };

  const categoryObj = categories.find(c => c.name === menuItem.category);
  const catId = categoryObj ? Number(categoryObj.id) : null;

  // Logic Exception: Jika nama menu mengandung kata "Hot", bypass opsi Ice Level menjadi false
  const isHotMenu = menuItem.name ? menuItem.name.toLowerCase().includes('hot') : false;

  const hasIce = (!isHotMenu && catId) ? selectedIceCategories.includes(catId) : false;
  const hasSugar = catId ? selectedSugarCategories.includes(catId) : false;

  return { hasIce, hasSugar };
};
  
const handleAddToCart = (menuItem) => {
  if (!selectedTable || selectedTable.status !== 'occupied') return;

  const { hasIce, hasSugar } = checkCategoryOptions(menuItem);

  if (hasIce || hasSugar) {
    setPendingMenuItem(menuItem);
    setSelectedIceOption(hasIce && iceLevels.length > 0 ? iceLevels[0].name : '');
    setSelectedSugarOption(hasSugar && sugarLevels.length > 0 ? sugarLevels[0].name : '');
    setOptionTargetMode('dine-in');
    setShowOptionModal(true);
  } else {
    executeAddToCartDineIn(menuItem, '', '');
  }
};

const executeAddToCartDineIn = (menuItem, iceOpt, sugarOpt) => {
  const tableId = selectedTable.id;
  const cart = currentCart[tableId] || [];

  // Match item berdasarkan ID + Ice + Sugar
  const existingIndex = cart.findIndex(
    item => item.id === menuItem.id && item.iceLevel === iceOpt && item.sugarLevel === sugarOpt
  );

  let updatedCart = [];
  if (existingIndex > -1) {
    updatedCart = cart.map((item, idx) => 
      idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
    );
  } else {
    updatedCart = [
      ...cart, 
      { ...menuItem, qty: 1, iceLevel: iceOpt, sugarLevel: sugarOpt }
    ];
  }
  setCurrentCart(prev => ({ ...prev, [tableId]: updatedCart }));
};
  
  const handleRemoveFromCart = (itemId) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    setCurrentCart(prev => ({ ...prev, [tableId]: cart.filter(item => item.id !== itemId) }));
  };

  const handleConfirmOrder = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const cart = currentCart[tableId] || [];
    if (cart.length === 0) return alert('Keranjang pesanan masih kosong!');

    try {
      const { data: activeOrders, error: orderErr } = await supabase
        .from('orders').select('id').eq('table_id', tableId).eq('order_type', 'dine-in').eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1);
      if (orderErr) throw orderErr;

      if (!activeOrders || activeOrders.length === 0) {
        return alert('Sesi order meja tidak ditemukan! Silakan Cancel Open Table lalu Open Table kembali.');
      }

      const activeOrderId = activeOrders[0].id;
      const { data: batchData, error: batchErr } = await supabase
        .from('order_batches').insert([{ order_id: activeOrderId }]).select().single();
      if (batchErr) throw batchErr;

      const itemsToInsert = cart.map(item => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
        ice_level: item.iceLevel || '',
        sugar_level: item.sugarLevel || ''
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      setCurrentCart(prev => ({ ...prev, [tableId]: [] }));
      fetchActiveOrders();
      alert('Order berhasil dikonfirmasi & dikirim ke Printer Dapur!');
    } catch (err) {
      alert('Gagal Confirm Order: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

const getTableRecap = (tableId) => {
    const batches = confirmedOrders[tableId] || [];
    const recapMap = {};
    const promoRecapMap = {};

    batches.forEach(b => {
      (b.items || []).forEach(it => {
        // 1. Grouping untuk Rincian Struk/Tampilan Kasir (Berdasarkan Varian)
        const key = `${it.name}_${it.iceLevel || ''}_${it.sugarLevel || ''}`;
        if (recapMap[key]) {
          recapMap[key].qty += it.qty;
        } else {
          recapMap[key] = { 
            ...it, 
            menu_id: Number(it.menu_id || it.id),
            id: Number(it.id || it.menu_id)
          };
        }

        // 2. Grouping Khusus Promo (Murni Berdasarkan Master menu_id)
        const promoKey = Number(it.menu_id || it.id);
        if (promoRecapMap[promoKey]) {
          promoRecapMap[promoKey].qty += it.qty;
        } else {
          promoRecapMap[promoKey] = {
            menu_id: promoKey,
            qty: it.qty
          };
        }
      });
    });

    const recapList = Object.values(recapMap);
    const promoRecapList = Object.values(promoRecapMap);

    const subTotal = recapList.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const autoDiscount = calculateAutoDiscount(promoRecapList);
    const finalTotal = Math.max(0, subTotal - autoDiscount);

    return { recapList, subTotal, autoDiscount, finalTotal, batches };
  };

  const handleCloseTableClick = () => {
    if (!selectedTable) return;
    const { finalTotal, batches } = getTableRecap(selectedTable.id);

    if (finalTotal === 0 || batches.length === 0) {
      if (confirm("Tidak ada tagihan pada meja ini. Tutup dan kosongkan meja sekarang?")) {
        handlePaymentSuccess(true);
      }
    } else {
      setShowCheckoutModal(true);
    }
  };

  const handlePaymentSuccess = async (isZeroPayment = false) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const sessionId = activeSessions[tableId];
    const { subTotal, autoDiscount, finalTotal } = getTableRecap(tableId);

    try {
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ subtotal: subTotal, discount: autoDiscount, total_amount: finalTotal, is_paid: true, status: 'completed' })
        .eq('table_id', tableId).eq('status', 'active');
      if (orderErr) throw orderErr;

      if (sessionId) await supabase.from('table_sessions').update({ status: 'closed' }).eq('id', sessionId);
      await supabase.from('tables').update({ status: 'available' }).eq('id', tableId);

      setCurrentCart(prev => { const n = { ...prev }; delete n[tableId]; return n; });
      fetchTables();
      fetchActiveOrders();

      if (!isZeroPayment) alert('Pembayaran Sukses! Struk Berhasil Dicetak.');
      setSelectedTable(prev => ({ ...prev, status: 'available' }));
      setShowCheckoutModal(false);
    } catch (err) {
      alert('Gagal menutup meja: ' + err.message);
    }
  };

  // --- 6. Alur Operasional Takeaway ---
const handleAddToTakeawayCart = (menuItem) => {
  const { hasIce, hasSugar } = checkCategoryOptions(menuItem);

  if (hasIce || hasSugar) {
    setPendingMenuItem(menuItem);
    setSelectedIceOption(hasIce && iceLevels.length > 0 ? iceLevels[0].name : '');
    setSelectedSugarOption(hasSugar && sugarLevels.length > 0 ? sugarLevels[0].name : '');
    setOptionTargetMode('takeaway'); // Menentukan target penyimpanan keranjang
    setShowOptionModal(true);
  } else {
    executeAddToCartTakeaway(menuItem, '', '');
  }
};

const executeAddToCartTakeaway = (menuItem, iceOpt, sugarOpt) => {
  const existingIndex = takeawayCart.findIndex(
    item => item.id === menuItem.id && item.iceLevel === iceOpt && item.sugarLevel === sugarOpt
  );

  if (existingIndex > -1) {
    setTakeawayCart(takeawayCart.map((item, idx) => 
      idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
    ));
  } else {
    setTakeawayCart([
      ...takeawayCart, 
      { ...menuItem, qty: 1, iceLevel: iceOpt, sugarLevel: sugarOpt }
    ]);
  }
};

// Handler Confirm dari Modal Options
const handleConfirmCustomOptions = () => {
  if (!pendingMenuItem) return;

  if (optionTargetMode === 'dine-in') {
    executeAddToCartDineIn(pendingMenuItem, selectedIceOption, selectedSugarOption);
  } else if (optionTargetMode === 'takeaway') {
    executeAddToCartTakeaway(pendingMenuItem, selectedIceOption, selectedSugarOption);
  }

  setShowOptionModal(false);
  setPendingMenuItem(null);
};
  
  const handleRemoveFromTakeawayCart = (itemId) => {
    setTakeawayCart(takeawayCart.filter(item => item.id !== itemId));
  };

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

    // Grouping khusus promo berdasarkan menu_id untuk Takeaway (Mengabaikan Varian Ice/Sugar)
    const takeawayPromoMap = {};
    takeawayCart.forEach(item => {
      const menuId = Number(item.id || item.menu_id);
      if (takeawayPromoMap[menuId]) {
        takeawayPromoMap[menuId].qty += Number(item.qty);
      } else {
        takeawayPromoMap[menuId] = { 
          menu_id: menuId, 
          id: menuId, 
          qty: Number(item.qty) 
        };
      }
    });

    const autoDiscount = calculateAutoDiscount(Object.values(takeawayPromoMap));
    const totalAmount = Math.max(0, subTotal - autoDiscount);
    
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert([{
        order_type: 'takeaway', order_no: generatedOrderNo, platform: takeawayPlatform,
        customer_name: takeawayCustomerName || 'Pelanggan', subtotal: subTotal,
        discount: autoDiscount, total_amount: totalAmount, is_paid: false, status: 'active'
      }])
      .select().single();

    if (orderErr) return alert('Gagal menyimpan order takeaway: ' + orderErr.message);

    const itemsToInsert = takeawayCart.map(item => ({
      order_id: orderData.id, menu_id: item.id, menu_name: item.name, price: item.price, qty: item.qty, category: item.category || 'Makanan', ice_level: item.iceLevel || '', sugar_level: item.sugarLevel || ''
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
    if (itemsErr) return alert('Gagal menyimpan item takeaway: ' + itemsErr.message);

    setTakeawayCart([]);
    setTakeawayCustomerName('');
    setTakeawayOrderNoInput('');
    fetchActiveOrders();
    alert(`Order ${generatedOrderNo} Berhasil Dikonfirmasi & Dicetak ke Dapur!`);
  };

  const handlePayTakeaway = async (order) => {
    const { error } = await supabase
      .from('orders')
      .update({ subtotal: order.subTotal, discount: order.discount, total_amount: order.total, is_paid: true })
      .eq('id', order.id);

    if (error) return alert('Gagal konfirmasi pembayaran: ' + error.message);
    setShowTakeawayPaymentModal(false);
    fetchActiveOrders();
    alert(`Pembayaran Order ${order.orderNo} Sukses & Struk Dicetak!`);
  };

  const handleCompleteTakeaway = async (orderId) => {
    if (confirm('Selesaikan & keluarkan orderan ini dari daftar antrean?')) {
      const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
      if (error) return alert('Gagal menyelesaikan order: ' + error.message);
      fetchActiveOrders();
    }
  };

  // --- 7. SELF ORDER CUSTOMER LOGIC ---
  const handleAddSelfOrderCart = (menuItem) => {
    const existingIndex = selfOrderCart.findIndex(item => item.id === menuItem.id);
    if (existingIndex > -1) {
      setSelfOrderCart(selfOrderCart.map((item, idx) => idx === existingIndex ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setSelfOrderCart([...selfOrderCart, { ...menuItem, qty: 1 }]);
    }
  };

  const handleRemoveSelfOrderCart = (itemId) => {
    setSelfOrderCart(selfOrderCart.filter(item => item.id !== itemId));
  };

  const handleSelfOrderSubmit = async () => {
    if (selfOrderCart.length === 0) return alert('Keranjang belanja Anda masih kosong!');
    const tableId = Number(selfOrderTableId);

    try {
      let activeOrderId = null;
      const { data: existingActiveOrders } = await supabase
        .from('orders')
        .select('id, session_id')
        .eq('table_id', tableId)
        .eq('order_type', 'dine-in')
        .eq('status', 'active')
        .limit(1);

      if (existingActiveOrders && existingActiveOrders.length > 0) {
        activeOrderId = existingActiveOrders[0].id;
      } else {
        const { data: sessionData, error: sErr } = await supabase
          .from('table_sessions')
          .insert([{ table_id: tableId, status: 'open' }])
          .select()
          .single();
        if (sErr) throw sErr;

        const { data: newOrderData, error: oErr } = await supabase
          .from('orders')
          .insert([{ session_id: sessionData.id, table_id: tableId, order_type: 'dine-in', status: 'active' }])
          .select()
          .single();
        if (oErr) throw oErr;

        await supabase.from('tables').update({ status: 'occupied' }).eq('id', tableId);
        activeOrderId = newOrderData.id;
      }

      const { data: batchData, error: bErr } = await supabase
        .from('order_batches')
        .insert([{ order_id: activeOrderId }])
        .select()
        .single();
      if (bErr) throw bErr;

      const itemsToInsert = selfOrderCart.map(item => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
        ice_level: item.iceLevel || '',
        sugar_level: item.sugarLevel || ''
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      setSelfOrderCart([]);
      fetchActiveOrders();
      alert('Pesanan Anda berhasil dikirim ke Dapur! Silakan tunggu hidangan Anda disajikan.');
    } catch (err) {
      alert('Gagal Mengirim Pesanan: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  // Calculations Dine-In
  const activeTableId = selectedTable?.id;
  const activeTableStatus = selectedTable?.status;
  const cartItems = activeTableId ? (currentCart[activeTableId] || []) : [];
  const { recapList, subTotal, autoDiscount, batches } = activeTableId ? getTableRecap(activeTableId) : { recapList: [], subTotal: 0, autoDiscount: 0, batches: [] };
  const finalTotal = Math.max(0, subTotal - autoDiscount);

  const filteredMenuList = selectedCategoryFilter === 'Semua' 
    ? menuList 
    : menuList.filter(m => m.category === selectedCategoryFilter);

  // ================= TAMPILAN PAGE SELF ORDER PELANGGAN (VIA QR) =================
  if (selfOrderTableId) {
    return <CustomerOrder tableId={selfOrderTableId} />;
  }

  // ================= TAMPILAN DASHBOARD POS KASIR & OWNER =================
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {tables.map(t => {
                const tableQrUrl = `${window.location.origin}?table=${t.id}`;

                return (
                  <div key={t.id} style={{ ...styles.cartRow, flexDirection: 'column', alignItems: 'center', padding: '12px', gap: '10px' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{t.number}</strong>
                      <div>
                        <button style={{ ...styles.roleBtn, color: '#f59e0b', padding: '2px 6px' }} onClick={() => handleEditTableClick(t)}>Edit</button>
                        <button style={{ ...styles.deleteBtn, padding: '2px 6px' }} onClick={() => handleDeleteTable(t.id)}>Hapus</button>
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: '8px', borderRadius: '8px', display: 'flex', justifyContent: 'center' }}>
                      <QRCodeSVG 
                        id={`qr-svg-${t.number}`}
                        value={tableQrUrl}
                        size={120}
                        level="H"
                        includeMargin={true}
                      />
                    </div>

                    <button 
                      type="button"
                      style={{ ...styles.primaryBtn, width: '100%', padding: '6px', fontSize: '12px', background: '#10b981' }}
                      onClick={() => handleDownloadQR(t.number)}
                    >
                      📥 Download QR Code
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Kelola Kategori Menu CRUD */}
          <div style={styles.ownerCard}>
            <h3>{isEditingCategory ? 'Edit Kategori Menu' : 'Tambah Kategori Menu Baru'}</h3>
            <form onSubmit={handleSaveCategory} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Nama Kategori (contoh: Dessert, Snacks, Coffee)" 
                value={categoryForm.name} 
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                style={styles.inputField}
              />
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingCategory ? '#f59e0b' : '#3b82f6' }}>
                {isEditingCategory ? 'Simpan Kategori' : '+ Tambah Kategori'}
              </button>
              {isEditingCategory && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingCategory(false); setCategoryForm({ id: null, name: '' }); }}>
                  Batal
                </button>
              )}
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categories.map(cat => (
                <div key={cat.id} style={{ ...styles.cartRow, gap: '8px' }}>
                  <span><strong>{cat.name}</strong></span>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b', padding: '2px 6px' }} onClick={() => handleEditCategoryClick(cat)}>Edit</button>
                  <button style={{ ...styles.deleteBtn, padding: '2px 6px' }} onClick={() => handleDeleteCategory(cat.id)}>Hapus</button>
                </div>
              ))}
            </div>
          </div>

          {/* ==================================================== */}
          {/* TAMBAHAN STEP 1: FITUR ICE LEVEL */}
          {/* ==================================================== */}
          <div style={styles.ownerCard}>
            <h3>{isEditingIce ? 'Edit Opsi Ice Level' : 'Tambah Opsi Ice Level Baru'}</h3>
            <form onSubmit={handleSaveIce} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Opsi Ice (contoh: Extra Ice, Less Ice, No Ice)" 
                value={iceForm.name} 
                onChange={(e) => setIceForm({ ...iceForm, name: e.target.value })}
                style={styles.inputField}
              />
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingIce ? '#f59e0b' : '#3b82f6' }}>
                {isEditingIce ? 'Simpan Opsi' : '+ Tambah Opsi Ice'}
              </button>
              {isEditingIce && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingIce(false); setIceForm({ id: null, name: '' }); }}>
                  Batal
                </button>
              )}
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {iceLevels.map(item => (
                <div key={item.id} style={{ ...styles.cartRow, gap: '8px' }}>
                  <span><strong>{item.name}</strong></span>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b', padding: '2px 6px' }} onClick={() => { setIceForm(item); setIsEditingIce(true); }}>Edit</button>
                  <button style={{ ...styles.deleteBtn, padding: '2px 6px' }} onClick={() => handleDeleteIce(item.id)}>Hapus</button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #334155', paddingTop: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#94a3b8' }}>PILIH KATEGORI YANG MEMILIKI OPSI ICE LEVEL:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {categories.map(cat => {
                  const isChecked = selectedIceCategories.includes(cat.id);
                  return (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', background: '#0f172a', padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155' }}>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => handleToggleIceCategory(cat.id)} 
                      />
                      <span>{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ==================================================== */}
          {/* TAMBAHAN STEP 1: FITUR SUGAR LEVEL */}
          {/* ==================================================== */}
          <div style={styles.ownerCard}>
            <h3>{isEditingSugar ? 'Edit Opsi Sugar Level' : 'Tambah Opsi Sugar Level Baru'}</h3>
            <form onSubmit={handleSaveSugar} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Opsi Sugar (contoh: 100% Sugar, 50% Sugar, No Sugar)" 
                value={sugarForm.name} 
                onChange={(e) => setSugarForm({ ...sugarForm, name: e.target.value })}
                style={styles.inputField}
              />
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingSugar ? '#f59e0b' : '#3b82f6' }}>
                {isEditingSugar ? 'Simpan Opsi' : '+ Tambah Opsi Sugar'}
              </button>
              {isEditingSugar && (
                <button type="button" style={styles.dangerOutlineBtn} onClick={() => { setIsEditingSugar(false); setSugarForm({ id: null, name: '' }); }}>
                  Batal
                </button>
              )}
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {sugarLevels.map(item => (
                <div key={item.id} style={{ ...styles.cartRow, gap: '8px' }}>
                  <span><strong>{item.name}</strong></span>
                  <button style={{ ...styles.roleBtn, color: '#f59e0b', padding: '2px 6px' }} onClick={() => { setSugarForm(item); setIsEditingSugar(true); }}>Edit</button>
                  <button style={{ ...styles.deleteBtn, padding: '2px 6px' }} onClick={() => handleDeleteSugar(item.id)}>Hapus</button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #334155', paddingTop: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#94a3b8' }}>PILIH KATEGORI YANG MEMILIKI OPSI SUGAR LEVEL:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {categories.map(cat => {
                  const isChecked = selectedSugarCategories.includes(cat.id);
                  return (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', background: '#0f172a', padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155' }}>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => handleToggleSugarCategory(cat.id)} 
                      />
                      <span>{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* 3. Kelola Menu CRUD */}
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
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  disabled={uploadingImage}
                  style={{ fontSize: '12px', color: '#94a3b8' }}
                />
                {uploadingImage && <span style={{ fontSize: '12px', color: '#f59e0b' }}>Uploading...</span>}
                {menuForm.image_url && (
                  <img 
                    src={menuForm.image_url} 
                    alt="Preview" 
                    style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} 
                  />
                )}
              </div>

              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingMenu ? '#f59e0b' : '#3b82f6' }}>
                {isEditingMenu ? 'Simpan Menu' : '+ Tambah Menu'}
              </button>

              {isEditingMenu && (
                <button 
                  type="button" 
                  style={styles.dangerOutlineBtn} 
                  onClick={() => { 
                    setIsEditingMenu(false); 
                    setMenuForm({ id: null, name: '', price: '', category: categories[0]?.name || '', image_url: '' }); 
                  }}
                >
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
                    {item.image_url && (
                      <img 
                        src={item.image_url} 
                        alt={item.name} 
                        style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', marginRight: '10px' }} 
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{item.name}</strong> - <span style={{ color: '#34d399' }}>Rp {Number(item.price).toLocaleString()}</span> <span style={{ color: '#60a5fa' }}>({item.category})</span>
                    </div>
                    <button style={{ ...styles.roleBtn, color: '#f59e0b', marginRight: '8px' }} onClick={() => handleEditMenuClick(item)}>Edit</button>
                    <button style={styles.deleteBtn} onClick={() => handleDeleteMenu(item.id)}>Hapus</button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 4. Kelola Promo Diskon Otomatis */}
          <div style={styles.ownerCard}>
            <h3>{isEditingDiscount ? 'Edit Rule Promo Diskon' : 'Pengaturan Rule Promo Diskon Otomatis'}</h3>
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
              <button type="submit" style={{ ...styles.primaryBtn, background: isEditingDiscount ? '#f59e0b' : '#3b82f6' }}>
                {isEditingDiscount ? 'Simpan Promo' : '+ Simpan Rule Promo'}
              </button>
              {isEditingDiscount && (
                <button 
                  type="button" 
                  style={styles.dangerOutlineBtn} 
                  onClick={() => { 
                    setIsEditingDiscount(false); 
                    setDiscountForm({ id: null, menuId: '', minQty: 1, discountAmount: 0 }); 
                  }}
                >
                  Batal
                </button>
              )}
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
                    <button 
                      style={{ ...styles.roleBtn, color: '#f59e0b', marginRight: '8px' }} 
                      onClick={() => handleEditDiscountClick(r)}
                    >
                      Edit
                    </button>
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
      <>
        {/* FILTER KATEGORI MENU */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setCashierCategoryFilter('Semua')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #334155',
              background: cashierCategoryFilter === 'Semua' ? '#3b82f6' : '#0f172a',
              color: cashierCategoryFilter === 'Semua' ? '#fff' : '#94a3b8',
              fontSize: '12px',
              fontWeight: cashierCategoryFilter === 'Semua' ? '600' : 'normal',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            Semua
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCashierCategoryFilter(cat.name)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: '1px solid #334155',
                background: cashierCategoryFilter === cat.name ? '#3b82f6' : '#0f172a',
                color: cashierCategoryFilter === cat.name ? '#fff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: cashierCategoryFilter === cat.name ? '600' : 'normal',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* GRID MENU */}
        <div style={styles.menuGrid}>
          {menuList
            .filter(menu => cashierCategoryFilter === 'Semua' || menu.category === cashierCategoryFilter)
            .map(menu => (
              <div key={menu.id} style={styles.menuCard} onClick={() => handleAddToCart(menu)}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
                    Rp {Number(menu.price).toLocaleString()}
                  </div>
                </div>
                <button 
                  style={styles.addMenuBtn} 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart(menu);
                  }}
                >
                  +
                </button>
              </div>
            ))}
        </div>
      </>
    )}
  </div>
)}
              
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
                          <h4 style={styles.subTitle}>Draft Pesanan Baru (Kasir)</h4>
                          {cartItems.length === 0 ? (
                            <p style={styles.mutedText}>Belum ada menu dipilih</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {cartItems.map(item => (
                                <div key={item.id} style={styles.cartRow}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.name}</div>
                                    {(item.iceLevel || item.sugarLevel) && (
                                      <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                                        {[item.iceLevel, item.sugarLevel].filter(Boolean).join(' • ')}
                                      </div>
                                    )}
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
                          <h4 style={styles.subTitle}>Riwayat Order Dapur (Kasir & Self Order)</h4>
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
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '6px' }}>
                                    {/* Kolom Kiri: Pakai textAlign: 'left' agar tidak terpengaruh CSS induk */}
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                      <div style={{ fontSize: '13px', fontWeight: '500' }}>
                                        {it.qty}x {it.name}
                                      </div>
                                      {(it.iceLevel || it.sugarLevel) && (
                                        <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '1px' }}>
                                          {[it.iceLevel, it.sugarLevel].filter(Boolean).join(' • ')}
                                        </div>
                                      )}
                                    </div>
                                
                                    {/* Kolom Kanan: Harga tetap rata kanan */}
                                    <div style={{ fontSize: '13px', color: '#9ca3af', marginLeft: '12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                      Rp {(it.price * it.qty).toLocaleString()}
                                    </div>
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
            </div>
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

                {/* FILTER KATEGORI MENU TAKEAWAY */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setCashierCategoryFilter('Semua')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      border: '1px solid #334155',
                      background: cashierCategoryFilter === 'Semua' ? '#3b82f6' : '#0f172a',
                      color: cashierCategoryFilter === 'Semua' ? '#fff' : '#94a3b8',
                      fontSize: '12px',
                      fontWeight: cashierCategoryFilter === 'Semua' ? '600' : 'normal',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s'
                    }}
                  >
                    Semua
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCashierCategoryFilter(cat.name)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: '1px solid #334155',
                        background: cashierCategoryFilter === cat.name ? '#3b82f6' : '#0f172a',
                        color: cashierCategoryFilter === cat.name ? '#fff' : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: cashierCategoryFilter === cat.name ? '600' : 'normal',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s'
                      }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                
                {/* GRID MENU TAKEAWAY */}
                <div style={styles.menuGrid}>
                  {menuList
                    .filter(menu => cashierCategoryFilter === 'Semua' || menu.category === cashierCategoryFilter)
                    .map(menu => (
                      <div key={menu.id} style={styles.menuCard} onClick={() => handleAddToTakeawayCart(menu)}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
                          <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
                            Rp {Number(menu.price).toLocaleString()}
                          </div>
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
                    takeawayCart.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} style={{ ...styles.cartRow, marginBottom: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.name}</div>
                          
                          {/* PENAMBAHAN: Subteks Ice & Sugar Level */}
                          {(item.iceLevel || item.sugarLevel) && (
                            <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px', marginBottom: '2px' }}>
                              {[item.iceLevel, item.sugarLevel].filter(Boolean).join(' • ')}
                            </div>
                          )}
                    
                          <small style={{ color: '#9ca3af' }}>Rp {Number(item.price).toLocaleString()} x {item.qty}</small>
                        </div>
                        <div style={{ fontWeight: '600', marginRight: '12px' }}>Rp {(item.price * item.qty).toLocaleString()}</div>
                        <button style={styles.deleteBtn} onClick={() => handleRemoveFromTakeawayCart(item.id)}>X</button>
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
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                              {/* Kolom Kiri: Pakai textAlign: 'left' */}
                              <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: '13px' }}>
                                  {it.qty}x {it.name}
                                </div>
                                {(it.iceLevel || it.sugarLevel) && (
                                  <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '1px' }}>
                                    {[it.iceLevel, it.sugarLevel].filter(Boolean).join(' • ')}
                                  </div>
                                )}
                              </div>
                          
                              {/* Kolom Kanan */}
                              <div style={{ fontSize: '13px', marginLeft: '12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                Rp {(it.price * it.qty).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: '2px' }}>
                            <span>Subtotal:</span>
                            <span>Rp {order.subTotal.toLocaleString()}</span>
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
          <div style={{ ...styles.modalCard, width: '480px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Rincian Pembayaran ({selectedTable.number})</h3>
            
            <div style={{ flex: 1, maxHeight: '50vh', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
              {recapList.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #374151', fontSize: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px', flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: '600', minWidth: '24px' }}>{item.qty}x</span>
                    <div>
                      <div style={{ fontWeight: '500' }}>{item.name}</div>
                      {(item.iceLevel || item.sugarLevel) && (
                        <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                          {[item.iceLevel, item.sugarLevel].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontWeight: '500', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                    Rp {(item.price * item.qty).toLocaleString()}
                  </span>
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
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #374151', fontSize: '13px' }}>
                  <div style={{ display: 'flex', gap: '8px', flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: '600', minWidth: '20px' }}>{it.qty}x</span>
                    <div>
                      <div style={{ fontWeight: '500' }}>{it.name}</div>
                      {(it.iceLevel || it.sugarLevel) && (
                        <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                          {[it.iceLevel, it.sugarLevel].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontWeight: '500', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                    Rp {(it.price * it.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              <span>Subtotal:</span>
              <span>Rp {selectedTakeawayOrder.subTotal.toLocaleString()}</span>
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
            {/* Modal Pilihan Ice & Sugar Level */}
      {showOptionModal && pendingMenuItem && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
              Kustomisasi {pendingMenuItem.name}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              Pilih varian level es dan gula untuk pesanan ini.
            </p>
      
            {/* Opsi Ice Level */}
            {checkCategoryOptions(pendingMenuItem).hasIce && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  ICE LEVEL:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {iceLevels.map(ice => (
                    <button
                      key={ice.id}
                      type="button"
                      onClick={() => setSelectedIceOption(ice.name)}
                      style={{
                        ...styles.roleBtn,
                        background: selectedIceOption === ice.name ? '#3b82f6' : '#0f172a',
                        color: selectedIceOption === ice.name ? '#fff' : '#94a3b8',
                        border: '1px solid #334155',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: selectedIceOption === ice.name ? '600' : 'normal'
                      }}
                    >
                      {ice.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
      
            {/* Opsi Sugar Level */}
            {checkCategoryOptions(pendingMenuItem).hasSugar && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  SUGAR LEVEL:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {sugarLevels.map(sugar => (
                    <button
                      key={sugar.id}
                      type="button"
                      onClick={() => setSelectedSugarOption(sugar.name)}
                      style={{
                        ...styles.roleBtn,
                        background: selectedSugarOption === sugar.name ? '#3b82f6' : '#0f172a',
                        color: selectedSugarOption === sugar.name ? '#fff' : '#94a3b8',
                        border: '1px solid #334155',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: selectedSugarOption === sugar.name ? '600' : 'normal'
                      }}
                    >
                      {sugar.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
      
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                style={{ ...styles.dangerOutlineBtn, flex: 1 }}
                onClick={() => { setShowOptionModal(false); setPendingMenuItem(null); }}
              >
                Batal
              </button>
              <button
                type="button"
                style={{ ...styles.primaryBtn, flex: 2 }}
                onClick={handleConfirmCustomOptions}
              >
                Tambahkan ke Order
              </button>
            </div>
          </div>
        </div>
        )}
      </>
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
  badgeSent: { background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' },
  paymentFooter: { borderTop: '1px solid #334155', paddingTop: '12px', marginTop: 'auto' },
  ownerCard: { background: '#1e293b', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '16px' },
  inputField: { background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px' },
  primaryBtn: { background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', width: '380px', boxSizing: 'border-box' }
};
