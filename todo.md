# Baby Tracker TODO

## Phase 1: Schema & i18n
- [x] Database schema: feeding_sessions, diaper_changes, telegram_settings tables
- [x] i18n translations: English, German, Ukrainian
- [x] Language context and switcher hook

## Phase 2: Core Layout & Navigation
- [x] DashboardLayout with bottom tab navigation (mobile-first)
- [x] Child selector (Nica / Nici) persistent in header
- [x] Language switcher in settings
- [x] Theme: clean, soft pastel baby-friendly design

## Phase 3: Breastfeeding Tracker
- [x] Live timer for left/right breast
- [x] Start/stop/switch breast functionality
- [x] Bottle feeding entry (amount in ml)
- [x] Save session to DB
- [x] Feeding history list per child

## Phase 4: Diaper Change Tracker
- [x] Quick entry: wet / dirty / both
- [x] Timestamp auto-filled
- [x] Save to DB
- [x] Diaper history list per child

## Phase 5: Daily Summary
- [x] Per-child stats: total feeding time, feeds count, last feed time
- [x] Diaper count per type per day
- [x] Date picker for past days

## Phase 6: Telegram Integration
- [x] Settings page: bot token + chat ID input
- [x] Test connection button
- [x] Configurable daily digest send time
- [x] Backend cron job for daily digest
- [x] Digest message format matching Telegram style

## Phase 7: PWA
- [x] manifest.json with icons
- [x] Service worker for offline support
- [x] Add to home screen prompt

## Phase 8: Tests & Delivery
- [x] Vitest tests for feeding and diaper routers
- [x] Vitest test for Telegram scheduler
- [x] Final checkpoint and delivery
