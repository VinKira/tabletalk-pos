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

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      let activeOrderId = null;

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

      const { data: batchData, error: bErr } = await supabase
        .from('order_batches')
        .insert([{ order_id: activeOrderId }])
        .select()
        .single();
      if (bErr) throw bErr;

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

  const totalCartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const filteredMenuList =
    selectedCategory === 'Semua' ? menuList : menuList.filter((m) => m.category === selectedCategory);

  return (
    <div style={styles.container}>
      {/* Dynamic Background Lighting Effects */}
      <div style={styles.bgGlowCenter} />

  {/* Header */}
      <header style={styles.header}>
        <div style={styles.brandWrapper}>
          <img src="/Logogold-nobg.png" alt="Table Talk Logo" style={styles.logoImage} />
          <div>
            <h1 style={styles.brandTitle}>Table Talk</h1>
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
        GOOD COFFEE &nbsp;•&nbsp; GREAT GAMES &nbsp;•&nbsp; BETTER TALKS
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

      {/* Grid Display Menu - 1 Frame per Menu */}
      <div style={styles.menuGrid}>
        {filteredMenuList.map((menu) => {
          const cartItem = cart.find((i) => i.id === menu.id);
          return (
            <div key={menu.id} style={styles.menuCard}>
              {/* Menu Image Container */}
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

              {/* Menu Details */}
              <div style={styles.menuInfo}>
                <h4 style={styles.menuName}>{menu.name}</h4>
                <div style={styles.menuPrice}>Rp {Number(menu.price).toLocaleString('id-ID')}</div>
              </div>

              {/* Action Button */}
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
              {cart.map((item) => (
                <div key={item.id} style={styles.cartItemRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#f3e9dc' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#889988' }}>
                      Rp {Number(item.price).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div style={styles.qtyControlInline}>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(item.id, -1)}>-</button>
                    <span style={styles.qtyTextInline}>{item.qty}</span>
                    <button style={styles.qtyBtnInline} onClick={() => handleUpdateQty(item.id, 1)}>+</button>
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

// Visual Styling Sesuai Tema Emerald Gold
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
  brandTitle: {
    fontSize: '18px',
    color: '#f3e9dc',
    fontWeight: '700',
    margin: 0,
    letterSpacing: '1px',
    lineHeight: '1.1',
  },
  brandTagline: {
    fontSize: '8px',
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
    marginLeft: 'auto', // Memindah badge ke ujung kanan
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
    paddingLeft: '16px',   // Memberi ruang agar "Semua" tidak mepet/terpotong di kiri
    paddingRight: '16px',  // Memberi ruang saat di-scroll sampai paling kanan
    paddingBottom: '16px',
    justifyContent: 'flex-start', // Memastikan urutan scroll mulai dari paling kiri
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
    height: '120px',
    borderRadius: '12px',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: '10px',
    border: '1px solid rgba(212, 175, 55, 0.15)',
  },
  menuImage: {
    width: '100%',
    height: '110px',
    objectFit: 'cover',
    borderRadius: '10px',
    marginBottom: '8px',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0a1d17',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '13px',
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
    justifyContent: 'center',
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
    background: 'rgba(212, 175, 55, 0.2)',
    color: '#d4af37',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    margin: '0 auto',
    border: '1px solid #d4af37',
  },
};
