// types/product.ts

import { Comment } from "./comment"

export interface Product {
  id: string
  name: string
  description?: string | null
  price: number
  image_url?: string | null
  in_stock: boolean
  discount_percent?: number | null
  created_at: string
  updated_at?: string
  comments?: Comment[]
}