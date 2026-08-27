import { useState } from 'react'
import './App.css'

function App() {
  const [cart, setCart] = useState([])
  
  const menuItems = [
    { id: 1, name: 'Espresso', price: 18000 },
    { id: 2, name: 'Americano', price: 22000 },
    { id: 3, name: 'Caffe Latte', price: 28000 },
    { id: 4, name: 'Cappuccino', price: 28000 },
    { id: 5, name: 'Croissant', price: 25000 },
  ]

  const addToCart = (item) => {
    setCart([...cart, item])
  }

  const total = cart.reduce((sum, item) => sum + item.price, 0)

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '20px', fontFamily: 'sans-serif' }}>
      {/* Menu List */}
      <div style={{ flex: 2 }}>
        <h2>Menu Coffee Shop</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {menuItems.map((item) => (
            <button 
              key={item.id} 
              onClick={() => addToCart(item)}
              style={{ padding: '15px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
            >
              <h3>{item.name}</h3>
              <p>Rp {item.price.toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart / Pesanan */}
      <div style={{ flex: 1, borderLeft: '2px solid #eee', paddingLeft: '20px' }}>
        <h2>Pesanan</h2>
        {cart.length === 0 ? <p>Belum ada item dipilih</p> : (
          <>
            <ul>
              {cart.map((item, index) => (
                <li key={index} style={{ marginBottom: '8px' }}>
                  {item.name} - Rp {item.price.toLocaleString()}
                </li>
              ))}
            </ul>
            <hr />
            <h3>Total: Rp {total.toLocaleString()}</h3>
            <button style={{ width: '100%', padding: '12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              Bayar Sekarang
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default App
