// app/components/layout/Footer.tsx
import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-bushal-forest text-white/60 mt-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand Column */}
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg bg-bushal-copper flex items-center justify-center shadow-lg shadow-bushal-copper/20">
                <span className="text-white font-heading font-bold text-lg leading-none">B</span>
              </div>
              <h2
                className="text-xl font-semibold text-white tracking-wide"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
              >
                Bushal
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-white/50 max-w-xs">
              Curated products, honest pricing, delivered across Bangladesh with care and transparency.
            </p>
          </div>

          {/* Shop Links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wide uppercase">Shop</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/dashboard" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>All Products</span>
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>My Cart</span>
                </Link>
              </li>
              <li>
                <Link href="/orders" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>My Orders</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Account Links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wide uppercase">Account</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/login" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>Sign In</span>
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>Register</span>
                </Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-bushal-copperGlow transition-colors duration-200">
                  <span>My Profile</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Trust */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wide uppercase">Support</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:hello@bushal.com"
                  className="hover:text-bushal-copperGlow transition-colors duration-200 flex items-center gap-2"
                >
                  <span>hello@bushal.com</span>
                </a>
              </li>
              <li className="flex items-center gap-2 text-white/70">
                <svg className="w-4 h-4 text-bushal-copper flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>bKash Accepted</span>
              </li>
              <li className="flex items-center gap-2 text-white/70">
                <svg className="w-4 h-4 text-bushal-copper flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>SSL Encrypted</span>
              </li>
              <li className="flex items-center gap-2 text-white/70">
                <svg className="w-4 h-4 text-bushal-copper flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>7-Day Returns</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <span>© {currentYear} Bushal. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-white/70 transition-colors">
              <span>Terms of Service</span>
            </Link>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <Link href="/privacy" className="hover:text-white/70 transition-colors">
              <span>Privacy Policy</span>
            </Link>
          </div>
          <span className="flex items-center gap-1.5">
            Made with care in Bangladesh 🇧🇩
          </span>
        </div>
      </div>
    </footer>
  )
}