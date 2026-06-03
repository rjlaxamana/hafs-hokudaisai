# Changelog

## [v0.3.1] - Inventory Logic & POS UI Fixes
### Fixed
- Fixed composite Set logic so adjusting a Set in the Stock tab correctly calculates and updates its underlying component items.
- Ensured local inventory stock updates and deductions automatically synchronize to Supabase.
- Adjusted POS item cards to display stock on the bottom-left and price on the bottom-right, and updated "Take Order" icon.

## [v0.3.0] - UI Overhaul & History Tab
### Added
- Built the History tab featuring real-time "Best Seller" and "Highest Earner" analytics, alongside a client-side CSV export generator.
### Changed
- Refactored the UI across all tabs to introduce a modern, rounded, aesthetic layout adhering to the requested color palette.
- Redesigned KDS view to use a skeuomorphic "waiter's notepad" aesthetic.
- Transformed `Stock` management to dynamically compute stock availability for composite sets based on their underlying components.

## [v0.2.0] - Cloud Sync Integration
### Added
- Integrated Supabase for cloud database backend.
- Implemented "Store-and-Forward" IndexedDB offline queueing with auto-sync to cloud.
- Added real-time KDS WebSocket subscription for instant cross-device updates.

## [v0.1.1] - Branding and Menu Update
### Changed
- Updated project branding to "HAFS 北大際" and applied actual Japanese Yen (JPY) menu item pricing.