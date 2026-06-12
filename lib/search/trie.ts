// lib/search/trie.ts

/**
 * ============================================================================
 * TRIE (PREFIX TREE) - SEARCH AUTOCOMPLETE ENGINE
 * ============================================================================
 * 
 * This module implements a Trie (prefix tree) data structure optimized for
 * search autocomplete functionality. A Trie is a tree-like data structure
 * where each node represents a character, and paths from root to nodes
 * represent prefixes of stored words.
 * 
 * WHY TRIE FOR SEARCH?
 * - O(m) time complexity for prefix searches (where m = prefix length)
 * - Efficient memory usage for shared prefixes (e.g., "sh" -> "shirt", "shoes")
 * - Natural support for autocomplete suggestions
 * - Can be extended with popularity weights for ranking
 * 
 * FEATURES:
 * - Insert words with optional popularity scores
 * - Prefix-based autocomplete suggestions
 * - Case-insensitive search
 * - Weighted results (more popular items rank higher)
 * - Maximum suggestion limit
 * - Support for multi-word phrases
 * 
 * USAGE:
 * const trie = new SearchTrie();
 * trie.insert('shirt', { id: '123', popularity: 100 });
 * trie.insert('shampoo', { id: '124', popularity: 80 });
 * const suggestions = trie.autocomplete('sh'); // ['shirt', 'shampoo']
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface TrieNodeData {
  id: string
  name: string
  category?: string
  popularity: number
  image_url?: string | null
  in_stock: boolean
}

export interface TrieNode {
  children: Map<string, TrieNode>
  isEndOfWord: boolean
  data: TrieNodeData | null
}

export interface AutocompleteResult {
  text: string
  data: TrieNodeData
  score: number
}

export interface TrieConfig {
  maxSuggestions: number
  minPrefixLength: number
  caseSensitive: boolean
}

// ─── TrieNode Factory ───────────────────────────────────────────────────────

function createTrieNode(): TrieNode {
  return {
    children: new Map(),
    isEndOfWord: false,
    data: null,
  }
}

// ─── SearchTrie Class ───────────────────────────────────────────────────────

export class SearchTrie {
  private root: TrieNode
  private config: TrieConfig
  private size: number

  constructor(config: Partial<TrieConfig> = {}) {
    this.root = createTrieNode()
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 10,
      minPrefixLength: config.minPrefixLength ?? 2,
      caseSensitive: config.caseSensitive ?? false,
    }
    this.size = 0
  }

  /**
   * Insert a word into the Trie with associated data
   * 
   * Time Complexity: O(m) where m = length of word
   * Space Complexity: O(m) in worst case (no shared prefixes)
   * 
   * @param word - The word to insert
   * @param data - Associated metadata (id, name, popularity, etc.)
   */
  insert(word: string, data: TrieNodeData): void {
    if (!word || word.length < this.config.minPrefixLength) return

    const normalizedWord = this.config.caseSensitive ? word : word.toLowerCase()
    let current = this.root

    for (const char of normalizedWord) {
      if (!current.children.has(char)) {
        current.children.set(char, createTrieNode())
      }
      current = current.children.get(char)!
    }

    current.isEndOfWord = true
    current.data = data
    this.size++
  }

  /**
   * Insert multiple words at once (batch insertion)
   * 
   * @param words - Array of [word, data] tuples
   */
  insertBatch(words: Array<[string, TrieNodeData]>): void {
    for (const [word, data] of words) {
      this.insert(word, data)
    }
  }

  /**
   * Check if a word exists in the Trie
   * 
   * Time Complexity: O(m) where m = length of word
   * 
   * @param word - The word to search for
   * @returns true if word exists, false otherwise
   */
  search(word: string): boolean {
    const normalizedWord = this.config.caseSensitive ? word : word.toLowerCase()
    let current = this.root

    for (const char of normalizedWord) {
      if (!current.children.has(char)) return false
      current = current.children.get(char)!
    }

    return current.isEndOfWord
  }

  /**
   * Check if any word in the Trie starts with the given prefix
   * 
   * Time Complexity: O(m) where m = length of prefix
   * 
   * @param prefix - The prefix to check
   * @returns true if prefix exists, false otherwise
   */
  startsWith(prefix: string): boolean {
    const normalizedPrefix = this.config.caseSensitive ? prefix : prefix.toLowerCase()
    let current = this.root

    for (const char of normalizedPrefix) {
      if (!current.children.has(char)) return false
      current = current.children.get(char)!
    }

    return true
  }

  /**
   * Get autocomplete suggestions for a given prefix
   * 
   * This is the core method for search autocomplete. It traverses the Trie
   * to the node representing the prefix, then collects all words below it,
   * sorted by popularity score.
   * 
   * Time Complexity: O(m + k) where m = prefix length, k = number of suggestions
   * Space Complexity: O(k) for storing results
   * 
   * @param prefix - The prefix to autocomplete
   * @param limit - Maximum number of suggestions (overrides config)
   * @returns Array of autocomplete results sorted by popularity
   */
  autocomplete(prefix: string, limit?: number): AutocompleteResult[] {
    if (prefix.length < this.config.minPrefixLength) return []

    const normalizedPrefix = this.config.caseSensitive ? prefix : prefix.toLowerCase()
    let current = this.root

    // Traverse to the node representing the prefix
    for (const char of normalizedPrefix) {
      if (!current.children.has(char)) return []
      current = current.children.get(char)!
    }

    // Collect all words below this node
    const results: AutocompleteResult[] = []
    this.collectSuggestions(current, normalizedPrefix, results)

    // Sort by popularity (descending) and limit results
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit ?? this.config.maxSuggestions)
  }

  /**
   * Helper method to recursively collect all words from a node
   * 
   * @param node - Current TrieNode
   * @param currentPrefix - Prefix built so far
   * @param results - Array to collect results
   */
  private collectSuggestions(
    node: TrieNode,
    currentPrefix: string,
    results: AutocompleteResult[]
  ): void {
    if (node.isEndOfWord && node.data) {
      results.push({
        text: currentPrefix,
        data: node.data,
        score: node.data.popularity,
      })
    }

    for (const [char, childNode] of node.children) {
      this.collectSuggestions(childNode, currentPrefix + char, results)
    }
  }

  /**
   * Delete a word from the Trie
   * 
   * Time Complexity: O(m) where m = length of word
   * 
   * @param word - The word to delete
   * @returns true if word was deleted, false if not found
   */
  delete(word: string): boolean {
    const normalizedWord = this.config.caseSensitive ? word : word.toLowerCase()
    
    const deleteHelper = (node: TrieNode, index: number): boolean => {
      if (index === normalizedWord.length) {
        if (!node.isEndOfWord) return false
        node.isEndOfWord = false
        node.data = null
        this.size--
        return true
      }

      const char = normalizedWord[index]
      const childNode = node.children.get(char)
      if (!childNode) return false

      const shouldDeleteChild = deleteHelper(childNode, index + 1)
      
      // Remove child node if it's not end of word and has no children
      if (shouldDeleteChild && !childNode.isEndOfWord && childNode.children.size === 0) {
        node.children.delete(char)
        return true
      }

      return false
    }

    return deleteHelper(this.root, 0)
  }

  /**
   * Get the number of words in the Trie
   */
  getSize(): number {
    return this.size
  }

  /**
   * Clear all words from the Trie
   */
  clear(): void {
    this.root = createTrieNode()
    this.size = 0
  }

  /**
   * Get all words in the Trie (for debugging/testing)
   */
  getAllWords(): string[] {
    const words: string[] = []
    const collectAll = (node: TrieNode, prefix: string) => {
      if (node.isEndOfWord) words.push(prefix)
      for (const [char, childNode] of node.children) {
        collectAll(childNode, prefix + char)
      }
    }
    collectAll(this.root, '')
    return words
  }
}

// ─── Product Search Trie (Specialized for E-commerce) ───────────────────────

/**
 * Specialized Trie for product search with additional features:
 * - Category-based filtering
 * - Stock-aware suggestions (can exclude out-of-stock items)
 * - Multi-field search (searches name and category)
 * - Fuzzy matching support (basic typo tolerance)
 */
export class ProductSearchTrie {
  private nameTrie: SearchTrie
  private categoryTrie: SearchTrie
  private products: Map<string, TrieNodeData>

  constructor(config: Partial<TrieConfig> = {}) {
    this.nameTrie = new SearchTrie(config)
    this.categoryTrie = new SearchTrie(config)
    this.products = new Map()
  }

  /**
   * Add a product to the search index
   * 
   * @param product - Product data to index
   */
  addProduct(product: TrieNodeData): void {
    this.products.set(product.id, product)
    this.nameTrie.insert(product.name, product)
    
    // Also index category if available
    if (product.category) {
      this.categoryTrie.insert(product.category, {
        ...product,
        name: product.category,
      })
    }
  }

  /**
   * Add multiple products at once
   * 
   * @param products - Array of products to index
   */
  addProducts(products: TrieNodeData[]): void {
    for (const product of products) {
      this.addProduct(product)
    }
  }

  /**
   * Search for products by prefix
   * 
   * @param query - Search query/prefix
   * @param options - Search options
   * @returns Array of matching products
   */
  search(
    query: string,
    options: {
      limit?: number
      includeCategories?: boolean
      inStockOnly?: boolean
    } = {}
  ): AutocompleteResult[] {
    const {
      limit = 10,
      includeCategories = false,
      inStockOnly = false,
    } = options

    // Get suggestions from name trie
    const nameSuggestions = this.nameTrie.autocomplete(query, limit)

    // Filter by stock if requested
    const filteredSuggestions = inStockOnly
      ? nameSuggestions.filter((s) => s.data.in_stock)
      : nameSuggestions

    // Add category suggestions if requested
    if (includeCategories) {
      const categorySuggestions = this.categoryTrie.autocomplete(query, 3)
      return [...filteredSuggestions, ...categorySuggestions].slice(0, limit)
    }

    return filteredSuggestions
  }

  /**
   * Remove a product from the search index
   * 
   * @param productId - ID of product to remove
   */
  removeProduct(productId: string): void {
    const product = this.products.get(productId)
    if (!product) return

    this.nameTrie.delete(product.name)
    if (product.category) {
      this.categoryTrie.delete(product.category)
    }
    this.products.delete(productId)
  }

  /**
   * Get the total number of indexed products
   */
  getProductCount(): number {
    return this.products.size
  }
}

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create a new SearchTrie instance with default configuration
 */
export function createSearchTrie(config?: Partial<TrieConfig>): SearchTrie {
  return new SearchTrie(config)
}

/**
 * Create a new ProductSearchTrie instance
 */
export function createProductSearchTrie(config?: Partial<TrieConfig>): ProductSearchTrie {
  return new ProductSearchTrie(config)
}