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

  // Fetch Metadata & Subscriptions
  useEffect(() => {
    fetchTableInfo();
    fetchCategories();
    fetchMenuList();

    const menuSub = supabase
      .channel('customer:menu_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_list' }, fetchMenuList)
      .subscribe();

    const catSub = supabase
      .channel('customer:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .subscribe();

    return () => {
      supabase.removeChannel(menuSub);
      supabase.removeChannel(catSub);
    };
  }, [tableId]);

  const fetchTableInfo = async () => {
    const { data } = await supabase.from('tables').select('number').eq('id', tableId).single();
    if (data) setTableNumber(data.number);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('id', { ascending: true });
    if (data) setCategories(data);
  };

  const fetchMenuList = async () => {
    const { data } = await supabase.from('menu_list').select('*').order('id', { ascending: true });
    if (data) setMenuList(data);
  };

  // Cart Handlers
  const handleAddToCart = (menu) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === menu.id);
      if (existing) {
        return prevCart.map((item) => (item.id === menu.id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prevCart, { ...menu, qty: 1 }];
    });
  };

  const handleUpdateQty = (itemId, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  // Submit Order Realtime ke Supabase & Dapur
  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      let activeOrderId = null;

      // 1. Cek / Buat Sesi Meja
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableId)
        .eq('order_type', 'dine-in')
        .eq('status', 'active')
        .limit(1);

      if (activeOrders && activeOrders.length > 0) {
        activeOrderId = activeOrders[0].id;
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

      // 2. Buat Batch Baru
      const { data: batchData, error: bErr } = await supabase
        .from('order_batches')
        .insert([{ order_id: activeOrderId }])
        .select()
        .single();
      if (bErr) throw bErr;

      // 3. Masukkan Order Items
      const itemsToInsert = cart.map((item) => ({
        order_id: activeOrderId,
        batch_id: batchData.id,
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
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

  // Calculations
  const totalCartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const filteredMenuList =
    selectedCategory === 'Semua' ? menuList : menuList.filter((m) => m.category === selectedCategory);

  return (
    <div style={styles.container}>
      {/* Dynamic Background Glow */}
      <div style={styles.bgGlowTop} />
      <div style={styles.bgGlowBottom} />

      {/* Header */}
      <header style={styles.header}>
        <div>
          <span style={styles.brandTitle}>TABLETALK</span>
          <div style={styles.tableBadge}>
            <span style={styles.pulseDot} />
            {tableNumber || `MEJA #${tableId}`}
          </div>
        </div>
      </header>

      {/* Hero Welcome */}
      <div style={styles.heroSection}>
        <p style={styles.subtitle}>Elegance in Every Flavor</p>
        <h2 style={styles.headline}>Kurasi Menu Eksklusif</h2>
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
          const cartItem = cart.find((i) => i.id === menu.id);
          return (
            <div key={menu.id} style={styles.menuCard}>
              <div style={styles.menuInfo}>
                <span style={styles.menuCategory}>{menu.category}</span>
                <h4 style={styles.menuName}>{menu.name}</h4>
                <div style={styles.menuPrice}>Rp {Number(menu.price).toLocaleString('id-ID')}</div>
              </div>

              {cartItem ? (
                <div style={styles.qtyControlInline}>
                  <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(menu.id, -1)}>-</button>
                  <span style={styles.qtyTextInline}>{cartItem.qty}</span>
                  <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(menu.id, 1)}>+</button>
                </div>
              ) : (
                <button style={styles.addBtn} onClick={() => handleAddToCart(menu)}>
                  + Tambah
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && !isCartOpen && (
        <div style={styles.floatingBarContainer}>
          <div style={styles.floatingBar} onClick={() => setIsCartOpen(true)}>
            <div style={styles.cartCountBadge}>{totalCartCount}</div>
            <div style={{ flex: 1, paddingLeft: '12px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Total Pesanan</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>
                Rp {cartSubtotal.toLocaleString('id-ID')}
              </div>
            </div>
            <button style={styles.viewCartBtn}>Lihat Pesanan →</button>
          </div>
        </div>
      )}

      {/* Sliding Luxury Cart Drawer / Modal */}
      {isCartOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.drawerCard}>
            <div style={styles.drawerHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Pesanan Anda</h3>
                <span style={{ fontSize: '12px', color: '#d97706' }}>{tableNumber || `Meja #${tableId}`}</span>
              </div>
              <button style={styles.closeBtn} onClick={() => setIsCartOpen(false)}>✕</button>
            </div>

            <div style={styles.drawerBody}>
              {cart.map((item) => (
                <div key={item.id} style={styles.cartItemRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#f8fafc' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      Rp {Number(item.price).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div style={styles.qtyControlInline}>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(item.id, -1)}>-</button>
                    <span style={styles.qtyTextInline}>{item.qty}</span>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(item.id, 1)}>+</button>
                  </div>

                  <div style={{ width: '80px', textAlign: 'right', fontWeight: '600', color: '#fbbf24', fontSize: '14px' }}>
                    Rp {(item.price * item.qty).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.drawerFooter}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ color: '#94a3b8' }}>Estimasi Total</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#fbbf24' }}>
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
            <h3 style={{ color: '#f8fafc', fontSize: '22px', margin: '12px 0 8px 0' }}>Pesanan Terkirim!</h3>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.5' }}>
              Hidangan Anda sedang diproses oleh tim dapur kami. Silakan bersantai menikmati suasana.
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

// Luxury Minimalist Dark Stylesheet
const styles = {
  container: {
    minHeight: '100vh',
    width: '100%',
    backgroundColor: '#090d16',
    color: '#f8fafc',
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
    padding: '16px',
    paddingBottom: '100px',
    position: 'relative',
    overflowX: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: '-100px',
    right: '-50px',
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(217,119,6,0.15) 0%, rgba(0,0,0,0) 70%)',
    pointerEvents: 'none',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: '0',
    left: '-50px',
    width: '350px',
    height: '350px',
    background: 'radial-gradient(circle, rgba(30,58,138,0.2) 0%, rgba(0,0,0,0) 70%)',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    paddingTop: '8px',
    marginBottom: '20px',
  },
  brandTitle: {
    fontSize: '11px',
    letterSpacing: '3px',
    color: '#d97706',
    fontWeight: '800',
    display: 'block',
  },
  tableBadge: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '2px',
  },
  pulseDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#10b981',
    borderRadius: '50%',
    boxShadow: '0 0 8px #10b981',
  },
  heroSection: {
    marginBottom: '24px',
  },
  subtitle: {
    fontSize: '12px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 4px 0',
  },
  headline: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    margin: 0,
    background: 'linear-gradient(to right, #ffffff, #cbd5e1)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  categoryBar: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '12px',
    scrollbarWidth: 'none',
  },
  categoryBtn: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#94a3b8',
    padding: '8px 16px',
    borderRadius: '30px',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  categoryBtnActive: {
    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    border: '1px solid #f59e0b',
    color: '#ffffff',
    fontWeight: '600',
    boxShadow: '0 4px 14px rgba(217,119,6,0.3)',
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '14px',
  },
  menuCard: {
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '140px',
  },
  menuInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  menuCategory: {
    fontSize: '10px',
    color: '#d97706',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
  },
  menuName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#f8fafc',
    margin: '4px 0 8px 0',
  },
  menuPrice: {
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '12px',
  },
  addBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#f8fafc',
    padding: '8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
  },
  qtyControlInline: {
    display: 'flex',
    alignItems: 'center',
    justify: 'space-between',
    background: 'rgba(217,119,6,0.15)',
    border: '1px solid rgba(217,119,6,0.3)',
    borderRadius: '10px',
    padding: '2px 4px',
  },
  qtyBtnInline: {
    background: 'transparent',
    border: 'none',
    color: '#fbbf24',
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
  floatingBarContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '0',
    right: '0',
    display: 'flex',
    justifyContent: 'center',
    padding: '0 16px',
    zIndex: 90,
  },
  floatingBar: {
    width: '100%',
    maxWidth: '450px',
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(217,119,6,0.4)',
    borderRadius: '20px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    cursor: 'pointer',
  },
  cartCountBadge: {
    background: '#d97706',
    color: '#fff',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '13px',
  },
  viewCartBtn: {
    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    border: 'none',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '14px',
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
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
  },
  drawerCard: {
    width: '100%',
    maxWidth: '500px',
    background: '#0f172a',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
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
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: '16px',
  },
  submitOrderBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    border: 'none',
    color: '#ffffff',
    padding: '14px',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(217,119,6,0.4)',
  },
  successIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    margin: '0 auto',
  },
};
