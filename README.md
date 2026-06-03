# HAFS 北大際 - POS & KDS

A Progressive Web App (PWA) designed to replace paper order slips at festival stalls. Built specifically to survive unstable festival network conditions using an offline-first architecture.

## Features
- **Cashier (POS):** Fast order taking, auto-calculates total price, and assigns a sequential Collection Number.
- **Kitchen (KDS):** Kanban-style queue for active orders.
- **Stock:** Real-time view and manual adjustment of inventory.
- **History:** Analytics for Best Seller and Highest Earner, complete with a client-side lifetime CSV Export block.

## Tech Stack
- React.js (Vite)
- Tailwind CSS
- Dexie.js (IndexedDB)
- Supabase (PostgreSQL & Realtime WebSockets)

## Deployment Instructions
This application uses a Supabase backend for real-time order syncing between POS and KDS, with an offline-first fallback using IndexedDB.

1. Rename `.env.example` to `.env` and fill in your Supabase project credentials.
2. Ensure your Supabase project has `menu_items`, `orders`, and `order_items` tables created per the schema in `SPECS.md`.
3. Build the production files:
   ```bash
   npm run build
   ```
4. A new `dist/` directory will be created in your folder.
5. Upload the contents of the `dist/` directory to any static hosting provider (e.g., Vercel, Netlify, Cloudflare Pages, or GitHub Pages).
6. Open the deployed URL on your festival tablets and select "Add to Home Screen" from the browser to install it as a native offline PWA.
