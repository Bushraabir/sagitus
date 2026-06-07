// app/components/product/ProductForm.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Product } from '@/app/types/product'
import { createBrowserClient } from '@/lib/supabase/client'
import Input from '../ui/Input'
import Button from '../ui/Button'

interface Category {
  id: string
  name: string
  slug: string
}

interface Props {
  mode: 'create' | 'edit'
  product?: Product
  categories: Category[]
}

export default function ProductForm({ mode, product, categories }: Props) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price?.toString() ?? '',
    discount_percent: product?.discount_percent?.toString() ?? '',
    stock_quantity: product?.stock_quantity?.toString() ?? '0',
    category: product?.category ?? (categories[0]?.name ?? 'General'),
  })

  const resolveImages = (p?: Product): string[] => {
    if (!p) return []
    if (Array.isArray(p.images) && p.images.length > 0) return p.images
    if (p.image_url) return [p.image_url]
    return []
  }

  const [images, setImages] = useState<string[]>(() => resolveImages(product))
  const [previews, setPreviews] = useState<string[]>(() => resolveImages(product))
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const resolved = resolveImages(product)
    setImages(resolved)
    setPreviews(resolved)
  }, [product?.id])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    setError('')
    setUploadProgress(0)

    const newUrls: string[] = []
    const newPreviews: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const localPreview = URL.createObjectURL(file)
      newPreviews.push(localPreview)

      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path = `products/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`)
        setUploading(false)
        return
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      newUrls.push(data.publicUrl)
      setUploadProgress(Math.round(((i + 1) / files.length) * 100))
    }

    setImages((prev) => [...prev, ...newUrls])
    setPreviews((prev) => [...prev, ...newPreviews])
    setUploading(false)
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    await uploadFiles(files)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    )
    await uploadFiles(files)
  }

  const removeImage = async (index: number) => {
    const url = images[index]
    if (url && url.includes('/product-images/')) {
      const path = url.split('/product-images/')[1]
      if (path) {
        await supabase.storage
          .from('product-images')
          .remove([`products/${path.split('/products/')[1]}`])
      }
    }
    setImages((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const qty = parseInt(form.stock_quantity) || 0
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: parseFloat(form.price),
      images,
      image_url: images[0] ?? null,
      in_stock: qty > 0,
      stock_quantity: qty,
      discount_percent: form.discount_percent ? parseInt(form.discount_percent) : null,
      category: form.category || 'General',
    }

    if (!payload.name) { setError('Product name is required'); setLoading(false); return }
    if (isNaN(payload.price) || payload.price <= 0) { setError('Enter a valid price'); setLoading(false); return }

    const url = mode === 'create' ? '/api/products' : `/api/products/${product?.id}`
    const method = mode === 'create' ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return
    }

    router.push('/admin/products')
    router.refresh()
  }

  const stockQty = parseInt(form.stock_quantity) || 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Product Name */}
      <Input
        id="name"
        name="name"
        label="Product Name *"
        value={form.name}
        onChange={handleChange}
        placeholder="e.g. Premium Cotton T-Shirt"
        required
      />

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Description
        </label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 text-sm transition-all duration-200 focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 hover:border-slate-300 resize-none"
          placeholder="Describe the product — material, size, features..."
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
        <select
          name="category"
          value={form.category}
          onChange={handleChange}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 text-sm transition-all duration-200 focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 hover:border-slate-300 cursor-pointer"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>{cat.name}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-slate-400">
          Manage categories in{' '}
          <a href="/admin/categories" className="text-orange-600 hover:underline font-medium">
            Admin → Categories
          </a>
        </p>
      </div>

      {/* Price & Discount */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          id="price"
          name="price"
          type="number"
          label="Price (৳) *"
          value={form.price}
          onChange={handleChange}
          placeholder="0.00"
          min="0.01"
          step="0.01"
          required
        />
        <Input
          id="discount_percent"
          name="discount_percent"
          type="number"
          label="Discount (%)"
          value={form.discount_percent}
          onChange={handleChange}
          placeholder="0"
          min="0"
          max="100"
          hint="Leave blank for no discount"
        />
      </div>

      {/* Stock Quantity */}
      <div>
        <Input
          id="stock_quantity"
          name="stock_quantity"
          type="number"
          label="Stock Quantity *"
          value={form.stock_quantity}
          onChange={handleChange}
          placeholder="0"
          min="0"
          step="1"
        />
        <div className="mt-2">
          {stockQty === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Out of Stock — will be hidden from customers
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              In Stock — {stockQty} unit{stockQty !== 1 ? 's' : ''} available
            </span>
          )}
        </div>
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Product Images
        </label>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? 'border-orange-400 bg-orange-50'
              : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2 pointer-events-none">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
              {uploading ? (
                <svg className="w-6 h-6 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            {uploading ? (
              <div className="w-full max-w-xs">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Uploading... {uploadProgress}%
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  Drop images here or click to upload
                </p>
                <p className="text-xs text-slate-400">PNG, JPG, WebP up to 10MB each</p>
              </>
            )}
          </div>
        </div>

        {/* Image previews */}
        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img src={src} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <div className="absolute top-1 left-1">
                    <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-md">
                      Main
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(i) }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {previews.length > 1 && (
          <p className="mt-1.5 text-xs text-slate-400">Drag to reorder — first image is the main photo</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" loading={loading} className="flex-1">
          {mode === 'create' ? 'Create Product' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}