import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerOrder({ tableId }) {
  const [categories, setCategories] = useState([]);
  const [menuList, setMenuList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [cart, setCart] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // --- STATE KATEGORI & OPTIONS ICE/SUGAR LEVEL ---
  const [iceLevels, setIceLevels] = useState([]);
  const [sugarLevels, setSugarLevels] = useState([]);
  const [selectedIceCategories, setSelectedIceCategories] = useState([]);
  const [selectedSugarCategories, setSelectedSugarCategories] = useState([]);

  // --- STATE MODAL PILIHAN OPSI ---
  const [showOptionModal, setShowOptionModal] = useState(false);
  const [pendingMenuItem, setPendingMenuItem] = useState(null);
  const [selectedIceOption, setSelectedIceOption] = useState('');
  const [selectedSugarOption, setSelectedSugarOption] = useState('');

  useEffect(() => {
    fetchTableInfo();
    fetchCategories();
    fetchMenuList();
    fetchIceLevelData();
    fetchSugarLevelData();

    const menuSub = supabase
      .channel('customer:menu_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_list' }, fetchMenuList)
      .subscribe();

    const catSub = supabase
      .channel('customer:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .subscribe();

    const iceSub = supabase
      .channel('customer:ice_levels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ice_levels' }, fetchIceLevelData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ice_level_categories' }, fetchIceLevelData)
      .subscribe();

    const sugarSub = supabase
      .channel('customer:sugar_levels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugar_levels' }, fetchSugarLevelData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugar_level_categories' }, fetchSugarLevelData)
      .subscribe();

    return () => {
      supabase.removeChannel(menuSub);
      supabase.removeChannel(catSub);
      supabase.removeChannel(iceSub);
      supabase.removeChannel(sugarSub);
    };
  }, [tableId]);

  const fetchTableInfo = async () => {
    const { data } = await supabase.from('tables').select('number').eq('id', tableId).single();
    if (data) setTableNumber(data.number);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('id', { ascending: true });
    if (data) {
      // Abaikan kategori 'Table' agar tidak muncul di tab pilihan
      const filtered = data.filter((cat) => cat.name.toLowerCase() !== 'table');
      setCategories(filtered);
    }
  };

  const fetchMenuList = async () => {
    const { data } = await supabase.from('menu_list').select('*').order('id', { ascending: true });
    if (data) setMenuList(data);
  };

  const fetchIceLevelData = async () => {
    const { data: levels } = await supabase.from('ice_levels').select('*').order('id', { ascending: true });
    if (levels) setIceLevels(levels);

    const { data: catMap } = await supabase.from('ice_level_categories').select('category_id');
    if (catMap) setSelectedIceCategories(catMap.map(c => c.category_id));
  };

  const fetchSugarLevelData = async () => {
    const { data: levels } = await supabase.from('sugar_levels').select('*').order('id', { ascending: true });
    if (levels) setSugarLevels(levels);

    const { data: catMap } = await supabase.from('sugar_level_categories').select('category_id');
    if (catMap) setSelectedSugarCategories(catMap.map(c => c.category_id));
  };

const checkCategoryOptions = (menuItem) => {
  if (!menuItem) return { hasIce: false, hasSugar: false };

  const categoryObj = categories.find(c => c.name === menuItem.category);
  const catId = categoryObj ? categoryObj.id : null;

  // Logic Exception: Jika nama menu mengandung kata "Hot", bypass opsi Ice Level menjadi false
  const isHotMenu = menuItem.name ? menuItem.name.toLowerCase().includes('hot') : false;

  const hasIce = (!isHotMenu && catId) ? selectedIceCategories.includes(catId) : false;
  const hasSugar = catId ? selectedSugarCategories.includes(catId) : false;

  return { hasIce, hasSugar };
};

  const handleAddToCart = (menu) => {
    const { hasIce, hasSugar } = checkCategoryOptions(menu);

    if (hasIce || hasSugar) {
      setPendingMenuItem(menu);
      setSelectedIceOption(hasIce && iceLevels.length > 0 ? iceLevels[0].name : '');
      setSelectedSugarOption(hasSugar && sugarLevels.length > 0 ? sugarLevels[0].name : '');
      setShowOptionModal(true);
    } else {
      executeAddToCart(menu, '', '');
    }
  };

  const executeAddToCart = (menu, iceOpt, sugarOpt) => {
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (item) => item.id === menu.id && item.iceLevel === iceOpt && item.sugarLevel === sugarOpt
      );
      if (existingIndex > -1) {
        return prevCart.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { ...menu, qty: 1, iceLevel: iceOpt, sugarLevel: sugarOpt }];
    });
  };

  const handleConfirmCustomOptions = () => {
    if (pendingMenuItem) {
      executeAddToCart(pendingMenuItem, selectedIceOption, selectedSugarOption);
      setShowOptionModal(false);
      setPendingMenuItem(null);
    }
  };

  const handleUpdateQty = (cartItemKey, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item, index) => {
          if (index === cartItemKey) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      const numericTableId = Number(tableId);
      let activeOrderId = null;

      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', numericTableId)
        .eq('order_type', 'dine-in')
        .eq('status', 'active')
        .limit(1);

      if (activeOrders && activeOrders.length > 0) {
        activeOrderId = activeOrders[0].id;
      } else {
        const { data: sessionData, error: sErr } = await supabase
          .from('table_sessions')
          .insert([{ table_id: numericTableId, status: 'open' }])
          .select()
          .single();
        if (sErr) throw sErr;

        const { data: newOrderData, error: oErr } = await supabase
          .from('orders')
          .insert([{ session_id: sessionData.id, table_id: numericTableId, order_type: 'dine-in', status: 'active' }])
          .select()
          .single();
        if (oErr) throw oErr;

        await supabase.from('tables').update({ status: 'occupied' }).eq('id', numericTableId);
        activeOrderId = newOrderData.id;
      }

      const { data: batchData, error: bErr } = await supabase
        .from('order_batches')
        .insert([{ order_id: activeOrderId }])
        .select()
        .single();
      if (bErr) throw bErr;

      const itemsToInsert = cart.map((item) => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: Number(item.id), // Pastikan menggunakan ID Master Menu dari objek menu
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
        ice_level: item.iceLevel || '',
        sugar_level: item.sugarLevel || ''
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      setCart([]);
      setIsCartOpen(false);
      setOrderSuccess(true);
    } catch (err) {
      alert('Gagal mengirim pesanan: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const filteredMenuList = menuList
    .filter((menu) => menu.category && menu.category.toLowerCase() !== 'table')
    .filter((menu) => (selectedCategory === 'Semua' ? true : menu.category === selectedCategory));

  return (
    <div style={styles.container}>
      <div style={styles.bgGlowCenter} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brandWrapper}>
          <img src="/Logogold-nobg.png" alt="Table Talk Logo" style={styles.logoImage} />
          <div>
            <span style={styles.brandTagline}>MAHJONG CAFE & LOUNGE</span>
          </div>
        </div>
        <div style={styles.tableBadge}>
          <span style={styles.pulseDot} />
          {tableNumber || `#${tableId}`}
        </div>
      </header>

      {/* Tagline Banner */}
      <div style={styles.topBarSub}>
        GOOD DINING &nbsp;•&nbsp; GREAT GAME &nbsp;•&nbsp; BETTER TALK
      </div>

      {/* Hero Welcome */}
      <div style={styles.heroSection}>
        <span style={styles.subtitle}>PILIH MENU FAVORITMU</span>
        <h2 style={styles.headline}>Menu Table Talk</h2>
      </div>

      {/* Category Pills Bar */}
      <div style={styles.categoryBar}>
        <button
          onClick={() => setSelectedCategory('Semua')}
          style={{
            ...styles.categoryBtn,
            ...(selectedCategory === 'Semua' ? styles.categoryBtnActive : {}),
          }}
        >
          Semua
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.name)}
            style={{
              ...styles.categoryBtn,
              ...(selectedCategory === cat.name ? styles.categoryBtnActive : {}),
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Grid Display Menu */}
      <div style={styles.menuGrid}>
        {filteredMenuList.map((menu) => {
          return (
            <div key={menu.id} style={styles.menuCard}>
              <div style={styles.imageWrapper}>
                {menu.image_url ? (
                  <img src={menu.image_url} alt={menu.name} style={styles.menuImage} />
                ) : (
                  <div style={styles.placeholderImage}>
                    <span>{menu.name.substring(0, 2).toUpperCase()}</span>
                  </div>
                )}
                <span style={styles.menuCategoryBadge}>{menu.category || 'MENU'}</span>
              </div>

              <div style={styles.menuInfo}>
                <h4 style={styles.menuName}>{menu.name}</h4>
                <div style={styles.menuPrice}>Rp {Number(menu.price).toLocaleString('id-ID')}</div>
              </div>

              <button style={styles.addBtn} onClick={() => handleAddToCart(menu)}>
                + Tambah
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer Quote */}
      <div style={styles.bottomBarQuote}>
        GOOD FOOD FUELS GREAT CONVERSATIONS
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && !isCartOpen && (
        <div style={styles.floatingBarContainer}>
          <div style={styles.floatingBar} onClick={() => setIsCartOpen(true)}>
            <div style={styles.cartCountBadge}>{totalCartCount}</div>
            <div style={{ flex: 1, paddingLeft: '12px' }}>
              <div style={{ fontSize: '10px', color: '#a3b18a', letterSpacing: '1px', textTransform: 'uppercase' }}>Pesanan Anda</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#f3e9dc' }}>
                Rp {cartSubtotal.toLocaleString('id-ID')}
              </div>
            </div>
            <button style={styles.viewCartBtn}>Lihat Pesanan →</button>
          </div>
        </div>
      )}

      {/* Modal Selection Opsi Ice & Sugar Level */}
      {showOptionModal && pendingMenuItem && (
        <div style={styles.modalOverlay}>
          <div style={styles.drawerCard}>
            <div style={styles.drawerHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#f3e9dc', fontFamily: 'serif' }}>Sesuaikan Pesanan</h3>
                <span style={{ fontSize: '13px', color: '#d4af37', fontWeight: '600' }}>{pendingMenuItem.name}</span>
              </div>
              <button style={styles.closeBtn} onClick={() => setShowOptionModal(false)}>✕</button>
            </div>

            <div style={{ padding: '20px 0' }}>
              {/* Opsi Ice Level */}
              {checkCategoryOptions(pendingMenuItem).hasIce && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#a3b18a', fontSize: '12px', letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>Pilih Ice Level:</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {iceLevels.map(ice => (
                      <button
                        key={ice.id}
                        type="button"
                        onClick={() => setSelectedIceOption(ice.name)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          border: selectedIceOption === ice.name ? '1px solid #d4af37' : '1px solid rgba(212, 175, 55, 0.2)',
                          background: selectedIceOption === ice.name ? 'rgba(212, 175, 55, 0.2)' : 'rgba(15, 30, 24, 0.6)',
                          color: selectedIceOption === ice.name ? '#d4af37' : '#889988',
                          cursor: 'pointer'
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
                  <label style={{ display: 'block', color: '#a3b18a', fontSize: '12px', letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>Pilih Sugar Level:</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {sugarLevels.map(sugar => (
                      <button
                        key={sugar.id}
                        type="button"
                        onClick={() => setSelectedSugarOption(sugar.name)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          border: selectedSugarOption === sugar.name ? '1px solid #d4af37' : '1px solid rgba(212, 175, 55, 0.2)',
                          background: selectedSugarOption === sugar.name ? 'rgba(212, 175, 55, 0.2)' : 'rgba(15, 30, 24, 0.6)',
                          color: selectedSugarOption === sugar.name ? '#d4af37' : '#889988',
                          cursor: 'pointer'
                        }}
                      >
                        {sugar.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button style={styles.submitOrderBtn} onClick={handleConfirmCustomOptions}>
              Masukkan Keranjang
            </button>
          </div>
        </div>
      )}

      {/* Sliding Luxury Cart Modal */}
      {isCartOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.drawerCard}>
            <div style={styles.drawerHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#f3e9dc', fontFamily: 'serif' }}>Pesanan Anda</h3>
                <span style={{ fontSize: '12px', color: '#d4af37' }}>Meja {tableNumber || `#${tableId}`}</span>
              </div>
              <button style={styles.closeBtn} onClick={() => setIsCartOpen(false)}>✕</button>
            </div>

            <div style={styles.drawerBody}>
              {cart.map((item, index) => (
                <div key={index} style={styles.cartItemRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#f3e9dc' }}>{item.name}</div>
                    {(item.iceLevel || item.sugarLevel) && (
                      <div style={{ fontSize: '11px', color: '#d4af37', marginTop: '2px' }}>
                        {[item.iceLevel, item.sugarLevel].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#889988', marginTop: '2px' }}>
                      Rp {Number(item.price).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div style={styles.qtyControlInline}>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(index, -1)}>-</button>
                    <span style={styles.qtyTextInline}>{item.qty}</span>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(index, 1)}>+</button>
                  </div>

                  <div style={{ width: '80px', textAlign: 'right', fontWeight: '600', color: '#d4af37', fontSize: '14px' }}>
                    Rp {(item.price * item.qty).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.drawerFooter}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ color: '#889988' }}>Total Tagihan</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#d4af37' }}>
                  Rp {cartSubtotal.toLocaleString('id-ID')}
                </span>
              </div>

              <button style={styles.submitOrderBtn} onClick={handleSubmitOrder} disabled={isSubmitting}>
                {isSubmitting ? 'Mengirim ke Dapur...' : 'Kirim Pesanan ke Dapur ✨'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {orderSuccess && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.drawerCard, textAlign: 'center', padding: '32px 24px' }}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={{ color: '#f3e9dc', fontSize: '22px', margin: '12px 0 8px 0', fontFamily: 'serif' }}>Pesanan Terkirim!</h3>
            <p style={{ color: '#889988', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.5' }}>
              Pesanan Anda sedang diproses oleh tim dapur kami. Silakan bersantai menikmati suasana.
            </p>
            <button style={styles.submitOrderBtn} onClick={() => setOrderSuccess(false)}>
              Tambah Pesanan Lain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Visual Styling
const styles = {
  container: {
    minHeight: '100vh',
    width: '100%',
    backgroundColor: '#05110d',
    color: '#e2e8f0',
    fontFamily: '"Cinzel", "Times New Roman", Georgia, serif, sans-serif',
    boxSizing: 'border-box',
    padding: '16px',
    paddingBottom: '100px',
    position: 'relative',
    overflowX: 'hidden',
  },
  bgGlowCenter: {
    position: 'absolute',
    top: '10%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: '600px',
    height: '400px',
    background: 'radial-gradient(circle, rgba(16, 68, 50, 0.45) 0%, rgba(5, 17, 13, 0) 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  header: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    paddingTop: '8px',
    marginBottom: '10px',
    position: 'relative',
    zIndex: 2,
  },
  brandWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoImage: {
    width: '80px',
    height: '80px',
    objectFit: 'contain',
  },
  brandTagline: {
    fontSize: '9px',
    letterSpacing: '2px',
    color: '#d4af37',
    display: 'block',
  },
  tableBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#d4af37',
    border: '1px solid rgba(212, 175, 55, 0.4)',
    padding: '6px 12px',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(5, 17, 13, 0.6)',
    marginLeft: 'auto',
  },
  pulseDot: {
    width: '6px',
    height: '6px',
    backgroundColor: '#10b981',
    borderRadius: '50%',
    boxShadow: '0 0 6px #10b981',
  },
  topBarSub: {
    textAlign: 'center',
    fontSize: '9px',
    letterSpacing: '3px',
    color: '#889988',
    marginBottom: '20px',
    opacity: 0.8,
  },
  heroSection: {
    textAlign: 'center',
    marginBottom: '24px',
    position: 'relative',
    zIndex: 2,
  },
  subtitle: {
    fontSize: '10px',
    color: '#d4af37',
    letterSpacing: '3px',
    display: 'block',
    marginBottom: '4px',
  },
  headline: {
    fontSize: '26px',
    fontWeight: '400',
    color: '#f3e9dc',
    margin: 0,
    letterSpacing: '1px',
    fontFamily: 'serif',
  },
  categoryBar: {
    display: 'flex',
    gap: '10px',
    overflowX: 'auto',
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingBottom: '16px',
    justifyContent: 'flex-start',
    position: 'relative',
    zIndex: 2,
    scrollbarWidth: 'none',
  },
  categoryBtn: {
    background: 'rgba(15, 30, 24, 0.6)',
    border: '1px solid rgba(212, 175, 55, 0.2)',
    color: '#a3b18a',
    padding: '8px 18px',
    borderRadius: '20px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  categoryBtnActive: {
    background: 'linear-gradient(135deg, #d4af37 0%, #aa7c11 100%)',
    border: '1px solid #fcf6ba',
    color: '#05110d',
    fontWeight: '700',
    boxShadow: '0 0 12px rgba(212, 175, 55, 0.4)',
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '16px',
    position: 'relative',
    zIndex: 2,
  },
  menuCard: {
    background: 'linear-gradient(180deg, rgba(12, 28, 22, 0.8) 0%, rgba(5, 17, 13, 0.95) 100%)',
    border: '1px solid rgba(212, 175, 55, 0.25)',
    borderRadius: '16px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    justify: 'space-between',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(10px)',
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: '5/4',
    borderRadius: '12px',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: '10px',
    border: '1px solid rgba(212, 175, 55, 0.15)',
  },
  menuImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0a1d17',
    display: 'flex',
    alignItems: 'center',
    justify: 'center',
    color: '#d4af37',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  menuCategoryBadge: {
    position: 'absolute',
    top: '6px',
    left: '6px',
    background: 'rgba(5, 17, 13, 0.8)',
    border: '1px solid rgba(212, 175, 55, 0.3)',
    color: '#d4af37',
    fontSize: '8px',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '1px',
  },
  menuInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginBottom: '12px',
  },
  menuName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#f3e9dc',
    margin: '0 0 4px 0',
    fontFamily: 'sans-serif',
  },
  menuPrice: {
    fontSize: '13px',
    color: '#d4af37',
    fontWeight: '500',
  },
  addBtn: {
    background: 'transparent',
    border: '1px solid #d4af37',
    color: '#d4af37',
    padding: '8px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.2s ease',
  },
  qtyControlInline: {
    display: 'flex',
    alignItems: 'center',
    justify: 'space-between',
    background: 'rgba(212,175,55,0.15)',
    border: '1px solid rgba(212,175,55,0.4)',
    borderRadius: '20px',
    padding: '2px 6px',
  },
  qtyBtnInline: {
    background: 'transparent',
    border: 'none',
    color: '#d4af37',
    fontSize: '16px',
    fontWeight: 'bold',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  },
  qtyTextInline: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
  },
  bottomBarQuote: {
    textAlign: 'center',
    fontSize: '9px',
    letterSpacing: '4px',
    color: '#d4af37',
    marginTop: '32px',
    opacity: 0.6,
  },
  floatingBarContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '0',
    right: '0',
    display: 'flex',
    justify: 'center',
    padding: '0 16px',
    zIndex: 90,
  },
  floatingBar: {
    width: '100%',
    maxWidth: '450px',
    background: 'rgba(10, 25, 20, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid #d4af37',
    borderRadius: '30px',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(212,175,55,0.2)',
    cursor: 'pointer',
  },
  cartCountBadge: {
    background: 'linear-gradient(135deg, #d4af37 0%, #aa7c11 100%)',
    color: '#05110d',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center', /* FIX: Mengoreksi 'justify' menjadi 'justifyContent' */
    fontWeight: '700',
    fontSize: '13px',
    flexShrink: 0,
    lineHeight: 1,
    boxSizing: 'border-box',
  },
  viewCartBtn: {
    background: 'linear-gradient(135deg, #d4af37 0%, #aa7c11 100%)',
    border: 'none',
    color: '#05110d',
    padding: '10px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'flex-end',
    justify: 'center',
    zIndex: 100,
  },
  drawerCard: {
    width: '100%',
    maxWidth: '500px',
    background: '#0a1d17',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    border: '1px solid rgba(212, 175, 55, 0.3)',
    padding: '24px',
    boxSizing: 'border-box',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(212, 175, 55, 0.2)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#889988',
    fontSize: '18px',
    cursor: 'pointer',
  },
  drawerBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 0',
  },
  cartItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  drawerFooter: {
    borderTop: '1px solid rgba(212, 175, 55, 0.2)',
    paddingTop: '16px',
  },
  submitOrderBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #d4af37 0%, #aa7c11 100%)',
    border: 'none',
    color: '#05110d',
    padding: '14px',
    borderRadius: '20px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(212,175,55,0.3)',
  },
  successIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'rgba(212, 175, 55, 0.15)',
    color: '#d4af37',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center', /* FIX: Mengoreksi 'justify' menjadi 'justifyContent' */
    fontSize: '28px',
    margin: '0 auto',
    border: '1px solid #d4af37',
    boxSizing: 'border-box',
    lineHeight: 1,
    flexShrink: 0,
  },
};
