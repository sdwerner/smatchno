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

## Deployment Notification

- [x] Post Telegram message on server startup with version + changelog (so deploys are visible in chat)

## /version Command

- [x] Add /version bot command: show current version, build date, uptime
- [x] Add /version to /help in EN/DE/UK

## Voice Commands

- [x] Handle Telegram voice messages: download OGG audio from Telegram file API
- [x] Transcribe via Whisper (voiceTranscription helper)
- [x] Route transcribed text through existing command dispatcher
- [x] Reply with transcription echo + command result (so user can see what was understood)
- [x] Handle transcription errors gracefully (reply with error message)

## /version Fix + Voice Improvements

- [x] Fix /version error: resolved on deployment (import.meta.url works in production)
- [x] Voice fuzzy-match: correct common Whisper mis-transcriptions (lock→log, lok→log, diary→diaper, etc.)
- [x] Voice confirmation: append 🎙 icon to bot replies that came from a voice message
- [x] Natural-language shortcuts: "last"/"status" without slash → /last; "today" → /today; "help" → /help

## Voice Recognition Debug

- [x] Debug voice pipeline end-to-end: root cause was Whisper trailing punctuation ("Last." not matching "last")
- [x] Fix: strip trailing punctuation in normalizeVoiceTranscription before all regex matching
- [x] Fix: MIME type normalization for audio/ogg; codecs=opus and application/octet-stream from Telegram
- [x] Add 16 regression tests for voice normalizer (66 total tests passing)

## Voice Time Parsing Improvements

- [x] Handle "o'clock" / "o clock" / "uhr" (DE) / "година" (UK) → strip to bare hour
- [x] Handle spoken number words → digits EN (zero–twelve, thirty, fifteen, etc.) + DE (null–zwölf, dreißig, etc.)
- [x] Handle "half past nine" / "half nine" / "halb X" → HH:30 format
- [x] Handle "quarter past" / "quarter to" / "viertel nach" / "dreiviertel" → HH:15 / HH:45
- [x] Fix parseTime to accept bare hours ("9" → 9:00)
- [x] Fix parseTimeRange to accept bare hours on either side
- [x] Fix ordering: bare-hour+minute colon insertion runs BEFORE range separators
- [x] 20/20 standalone normalizer tests + 66/66 vitest tests passing

## Vitamin D Tracking

- [x] Add `vitamin_d_logs` table to schema (id, child, givenAt, createdAt)
- [x] Generate migration SQL and apply to live DB
- [x] Add DB helpers: insertVitaminDLog, getVitaminDCalendar, hasVitaminDToday
- [x] Add tRPC procedures: vitaminD.log, vitaminD.calendar
- [x] Add /log vitd handler in bot (nica/nici/both, with historical date prefix support)
- [x] Add 2-hour Vitamin D reminder scheduler (fires after noon Vienna time if not logged)
- [x] Update /help with vitd command in EN/DE/UK
- [x] Add Vitamin D calendar view in dashboard (green tick ✅ / red cross ❌ per day per child)
- [x] Add Pill icon link to /vitamind in dashboard header
- [x] Add /vitamind route in App.tsx
- [x] 66/66 tests passing, TypeScript clean

## Backend Bug Fixes

- [x] Fix feeding reminders not being sent: feedingReminder.ts now uses getRecentFeedingSessions() (withRetry-wrapped) instead of raw getDb() query
- [x] Fix ECONNRESET errors: added periodic SELECT 1 keep-alive ping every 4 minutes to prevent MySQL from closing idle connections
- [x] Improved DB pool: keepAliveInitialDelay=0, connectTimeout=10000, ping clears on resetDb()

## Quick-Log Mode (Point-in-Time)

- [x] Bot: accept /log nica left (no time range) → use Date.now() as startTime, duration=0
- [x] Bot: accept /log nica bottle own 65 (no time range) → point-in-time
- [x] Bot: accept /log both right → log for both children at current time
- [x] Voice: quick-log phrases work naturally (normalizer already handles, no changes needed)
- [x] Dashboard: feed COUNT is primary metric; quick-log entries shown as ⚡ Left / ⚡ Right
- [x] Dashboard: "Last fed" stat card now shows "X ago" sub-label
- [x] /help: document quick-log syntax in EN/DE/UK
- [x] CHANGELOG: v1.6.0 entry added
- [x] package.json: bumped to 1.6.0
- [x] 66/66 tests passing, TypeScript clean

## Server Crash + Reminder Investigation

- [x] Investigate server crash on first /log entry — fixed: raw db.insert calls in handleLog replaced with withRetry-wrapped insertFeedingSession/insertDiaperChange helpers
- [x] Investigate feeding reminders not being sent — fixed: feedingReminder.ts now uses leftEnd/rightEnd timestamps for elapsed time; all bot read queries use withRetry-wrapped helpers
- [x] All bot functions (/log, /last, /today, /week, /summary) now use withRetry-wrapped DB helpers — no more ECONNRESET crashes
- [x] Tests updated: 66/66 passing with new mock architecture
- [x] Version bumped to v1.6.1, CHANGELOG updated

## Reminder Investigation (2026-04-05)

- [x] Check server logs for reminder scheduler errors — confirmed ECONNRESET on both scheduler and reminder at 21:14:56
- [x] Re-read feedingReminder.ts for logic bugs — logic correct, uses withRetry-wrapped helper
- [x] Re-read telegramScheduler.ts for scheduler setup bugs — logic correct, uses withRetry-wrapped helper
- [x] Verify DB helpers used by reminder return correct data — helpers correct
- [x] Fix identified root cause — withRetry checked err.message but Drizzle wraps ECONNRESET in err.cause; now checks both; also added reconnect lock and proactive ping reconnect
- [x] Add/update tests for reminder logic — 66/66 passing, no new tests needed (fix is in db.ts infrastructure)

## Deployment Notification Fix

- [x] Only send startup Telegram message when version has changed since last deploy

## /snooze Command + Deployment Notification Fix

- [x] Add /snooze command: parse duration (e.g. /snooze 2h, /snooze 30m, /snooze off)
- [x] Wire snooze state into feedingReminder.ts (global snooze overrides per-child snooze)
- [x] Register /snooze in BotFather bot commands
- [x] Update /help in EN/DE/UK with /snooze syntax
- [x] Add tests for /snooze command (8 new tests, 74 total passing)
- [x] Deployment notification: only send when version has changed (sentinel file .last-deploy-version)
