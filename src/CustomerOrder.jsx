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
  
  // State untuk Modal Opsi & Notes
  const [selectedMenuForOption, setSelectedMenuForOption] = useState(null);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [itemNotes, setItemNotes] = useState('');
  
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

  const handleOpenOptionModal = async (menu) => {
    setSelectedMenuForOption(menu);
    setItemNotes('');

    const { data: allOptions } = await supabase.from('menu_options').select('*');
    const catObj = categories.find((c) => c.name === menu.category);
    const allowed = catObj?.allowed_options || [];

    const filteredOpts = (allOptions || []).filter((o) => allowed.includes(o.title));
    setDynamicOptions(filteredOpts);

    const init = {};
    filteredOpts.forEach((o) => {
      if (o.values && o.values.length > 0) init[o.title] = o.values[0];
    });
    setSelectedOptions(init);
  };

  const handleConfirmAddToCart = () => {
    if (!selectedMenuForOption) return;

    const cartKey = `${selectedMenuForOption.id}-${JSON.stringify(selectedOptions)}-${itemNotes}`;

    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item.cartKey === cartKey);

      if (existingIndex > -1) {
        return prevCart.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
        );
      }

      return [
        ...prevCart,
        {
          ...selectedMenuForOption,
          qty: 1,
          options: selectedOptions,
          notes: itemNotes,
          cartKey: cartKey
        }
      ];
    });

    setSelectedMenuForOption(null);
  };

  const handleUpdateQty = (cartKey, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.cartKey === cartKey) {
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
        menu_id: item.id,
        menu_name: item.name,
        price: item.price,
        qty: item.qty,
        category: item.category || 'Makanan',
        options: item.options || {},
        notes: item.notes || ''
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // NOTIFIKASI SUKSES TANPA DIALOG PRINT KITCHEN LABEL UNTUK CUSTOMER
      setCart([]);
      setIsCartOpen(false);
      setOrderSuccess(true);
    } catch (err) {
      alert('Gagal Mengirim Pesanan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMenuList = selectedCategory === 'Semua'
    ? menuList
    : menuList.filter((m) => m.category === selectedCategory);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div style={{ backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'sans-serif' }}>
      {/* Top Bar */}
      <div style={{ backgroundColor: '#1e293b', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Self Order Menu</h2>
          <span style={{ fontSize: '12px', color: '#38bdf8' }}>Meja: {tableNumber || tableId}</span>
        </div>
      </div>

      {/* Pop-up Sukses Pesan */}
      {orderSuccess && (
        <div style={{ backgroundColor: '#065f46', color: '#a7f3d0', padding: '12px 16px', margin: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ Pesanan Anda berhasil terkirim ke Dapur!</span>
          <button onClick={() => setOrderSuccess(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto', borderBottom: '1px solid #334155' }}>
        <button
          onClick={() => setSelectedCategory('Semua')}
          style={{
            padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap',
            backgroundColor: selectedCategory === 'Semua' ? '#3b82f6' : '#1e293b', color: '#fff'
          }}
        >
          Semua
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.name)}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap',
              backgroundColor: selectedCategory === cat.name ? '#3b82f6' : '#1e293b', color: '#fff'
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* List Menu */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
        {filteredMenuList.map((menu) => (
          <div key={menu.id} style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {menu.image_url && (
              <img src={menu.image_url} alt={menu.name} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }} />
            )}
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{menu.name}</div>
              <div style={{ fontSize: '11px', color: '#60a5fa', margin: '2px 0' }}>{menu.category}</div>
              <div style={{ fontSize: '13px', color: '#34d399', fontWeight: 'bold' }}>Rp {Number(menu.price).toLocaleString()}</div>
            </div>
            <button
              onClick={() => handleOpenOptionModal(menu)}
              style={{ marginTop: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              + Tambah
            </button>
          </div>
        ))}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#1e293b', padding: '12px 20px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 }}>
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{cart.reduce((s, i) => s + i.qty, 0)} Item Dipilih</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>Rp {cartTotal.toLocaleString()}</div>
          </div>
          <button
            onClick={() => setIsCartOpen(true)}
            style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Lihat Keranjang
          </button>
        </div>
      )}

      {/* Modal Options & Notes */}
      {selectedMenuForOption && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '16px' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '380px', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Opsi: {selectedMenuForOption.name}</h3>

            {dynamicOptions.map((opt) => (
              <div key={opt.id} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>{opt.title}:</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(opt.values || []).map((val) => (
                    <button
                      key={val}
                      onClick={() => setSelectedOptions({ ...selectedOptions, [opt.title]: val })}
                      style={{
                        padding: '6px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid #334155',
                        backgroundColor: selectedOptions[opt.title] === val ? '#2563eb' : '#0f172a',
                        color: selectedOptions[opt.title] === val ? '#fff' : '#94a3b8'
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Notes (Opsional):</label>
              <input
                type="text"
                placeholder="Contoh: Tanpa sedotan, less sweet..."
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', boxSizing: 'border-box', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSelectedMenuForOption(null)} style={{ flex: 1, padding: '8px', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer' }}>Batal</button>
              <button onClick={handleConfirmAddToCart} style={{ flex: 2, padding: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Tambahkan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cart Detail */}
      {isCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '16px' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Pesanan Meja {tableNumber || tableId}</h3>

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              {cart.map((item) => (
                <div key={item.cartKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{item.name}</div>
                    {item.options && Object.keys(item.options).length > 0 && (
                      <div style={{ fontSize: '11px', color: '#60a5fa' }}>
                        {Object.values(item.options).join(' • ')}
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: '11px', color: '#f59e0b', italic: 'true' }}>
                        Note: {item.notes}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Rp {Number(item.price).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => handleUpdateQty(item.cartKey, -1)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', cursor: 'pointer' }}>-</button>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{item.qty}</span>
                    <button onClick={() => handleUpdateQty(item.cartKey, 1)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
              <span>Total:</span>
              <span style={{ color: '#10b981' }}>Rp {cartTotal.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setIsCartOpen(false)} style={{ flex: 1, padding: '10px', border: '1px solid #94a3b8', color: '#94a3b8', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer' }}>Kembali</button>
              <button onClick={handleSubmitOrder} disabled={isSubmitting} style={{ flex: 2, padding: '10px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                {isSubmitting ? 'Kirim...' : 'Kirim Pesanan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
