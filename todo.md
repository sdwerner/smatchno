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

## Bug Fixes (Active)

- [x] Bot /log command not saving entries to database — fixed: loggedBy was 0 (FK violation) instead of null; also fixed ECONNRESET with connection pool + withRetry

## Historical Entry Backfill

- [ ] Support optional date prefix in /log: DD.MM or DD.MM.YYYY (e.g. /log 19.03 nica left 14:00-14:10)
- [ ] Default to today if no date given (existing behaviour preserved)
- [ ] Update /help text to document date prefix syntax
- [ ] Tests for date prefix parsing

## Historical Entry Backfill

- [x] Make date prefix OPTIONAL in /log (DD.MM or DD.MM.YYYY) — defaults to today if omitted
- [x] Update /help text to show date as optional first argument (all 3 languages)
- [x] Tests for date prefix parsing (with and without date) — 44 tests total, all passing

## /delete Command

- [x] Add deleteLastEntry(child) DB helper in db.ts
- [x] Add /delete command handler in telegramBot.ts (nica / nici / both)
- [x] Confirmation message showing what was deleted (type, time, date)
- [x] Register /delete in bot commands via BotFather API
- [x] Update /help text with /delete syntax
- [x] Tests for /delete command

## Dashboard Edit/Delete

- [x] Add updateFeedingSession / updateDiaperChange DB helpers
- [x] Add feeding.update and diaper.update tRPC procedures
- [x] Add edit modal in AnalyticsDashboard for feeding entries (time, side, ml)
- [x] Add edit modal for diaper entries (type, time)
- [x] Add delete button with confirmation on each timeline entry
- [x] Cache invalidation after edit/delete

## /last Command Fix

- [x] Show bottle feeding details in /last output (ml, type)
- [x] Show last diaper change in /last output (type, time, ago)
- [x] Support optional child argument: /last nica or /last nici (defaults to both)
- [x] Update /help text to document /last nica|nici syntax

## Timezone Fix (Vienna UTC+1/UTC+2)

- [x] Fix bot: parse user-typed HH:MM as Vienna local time (not server NY time)
- [x] Fix bot: startOfDay/endOfDay for /today, /summary, /week use Vienna midnight
- [x] Fix bot: format() calls for display use Vienna time
- [x] Fix bot: historical date prefix (DD.MM) uses Vienna midnight
- [x] Fix dashboard: date navigation boundaries use Vienna time (browser-local = correct)
- [x] Fix dashboard: format() display calls use Vienna time (browser-local = correct)

## Dashboard Parity (bot = dashboard)

- [x] Wire /settings route in App.tsx and add gear icon nav link in dashboard header
- [x] Add Log Entry UI in dashboard: manual feeding log (child, side/bottle, time range)
- [x] Add Log Entry UI in dashboard: manual diaper log (child, type, time)
- [ ] Add Delete Last Entry button in dashboard (mirrors /delete command) — deferred
- [x] Add /settings bot command: show current config + link to settings page
- [x] Update /help to document /settings command

## Bottle ml Parsing Bug

- [x] Fix: /log nica own bottle 19:25-19:30 incorrectly parses 19 (hour from time range) as ml amount
