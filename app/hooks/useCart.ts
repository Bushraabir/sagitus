// hooks/useCart.ts
// Zustand store for cart state. Persists to localStorage so cart survives page refreshes.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartItem } from '@/app/types/cart'
import { Product } from '@/app/types/product'

interface CartStore {
  items: CartItem[]
  addItem: (product: Product) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        const existing = get().items.find((i) => i.id === product.id)
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === product.id
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          })
        } else {
          set({
            items: [
              ...get().items,
              {
                id: product.id,
                name: product.name,
                price: product.price,
                image_url: product.image_url ?? null,
                discount_percent: product.discount_percent ?? null,
                quantity: 1,
              },
            ],
          })
        }
      },

      removeItem: (id: string) => {
        set({ items: get().items.filter((i) => i.id !== id) })
      },

      updateQuantity: (id: string, quantity: number) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== id) })
          return
        }
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        })
      },

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'Bushal-cart', // localStorage key
    }
  )
)