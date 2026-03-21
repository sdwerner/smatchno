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

## Telegram Native Upgrade

- [x] Save TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as secrets
- [x] Register bot commands via BotFather API
- [x] Webhook handler for incoming Telegram messages
- [x] Bot commands: /feed, /diaper, /bottle, /summary, /today, /last, /help
- [x] Feeding reminder engine (3h threshold, 24/7)
- [x] Telegram Mini App launch button in bot
- [x] Telegram initData validation for auth (TelegramContext)
- [x] Tests for bot command handlers (12 tests, all passing)
- [x] Push updated code to GitHub

## Telegram-First Rebuild

- [x] /log command: structured parser for child, side (left/right/bottle), time range
- [x] Language auto-detection (DE/EN/UK) per user/message
- [x] Confirmation message after each /log entry
- [x] /today command: today's summary per child
- [x] /week command: 7-day stats per child
- [x] /summary command: specific date summary with inline Analytics button
- [x] /help command: updated for new command set (EN/DE/UK)
- [x] Refined 3h feeding reminder with multilingual formatting
- [x] Inline "📊 Analytics Dashboard" button in bot messages → opens web dashboard
- [x] Rebuilt web app as analytics-only dashboard (no login required)
- [x] Charts: bar chart for feedings, line chart for diapers (7-day)
- [x] Per-child feeding timeline with duration breakdown
- [x] 29 tests passing across 3 test files
- [x] Push to GitHub

## Minor Improvements

- [x] Show app version number in the analytics dashboard

## Bug Fixes

- [x] Fix BUTTON_TYPE_INVALID: web_app button not allowed in regular groups — replaced with plain URL button

## /log Command Extensions

- [x] Support `own Xml` (own milk bottle) in /log command
- [x] Support `other Xml` (other/formula milk bottle) in /log command
- [x] Support combined breast + bottle in one /log entry: e.g. /log nici right 14:00-15:00 own 15ml
- [x] Case-insensitive child names (Nica/nica/NICA) — working
- [x] Additional breast aliases: l/r, li/re, re/ri shortcuts
- [x] Update /help text to document new bottle syntax
- [x] Update i18n strings for own/other milk labels
- [x] Tests for new /log bottle parsing (39 total, all passing)
- [x] Support `both` as child name → logs same session for Nica AND Nici
- [x] Support `both` as breast side → total time split 50/50 between left and right
- [x] Support `/log both both 14:00-15:00` → joint session, both babies, both breasts split
