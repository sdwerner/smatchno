# Changelog

## v1.6.3 — /snooze command + deployment notification fix

- New: `/snooze 2h` / `/snooze 30m` / `/snooze 1h30m` — silence feeding reminders for a custom duration
- New: `/snooze off` — cancel active snooze immediately
- New: `/snooze` (no args) — check current snooze status
- New: `/snooze` hint appended to every feeding reminder message
- Fix: deployment notification now only fires when the version has changed (sentinel file `.last-deploy-version`); no more spam on every server restart
- Improvement: bot command menu (BotFather autocomplete) now includes `/snooze` and all commands are registered on every deploy
- /help updated in EN/DE/UK with `/snooze` syntax
- 74/74 tests passing

## v1.6.2 — Connection retry deep-fix

- Fix: `withRetry` now checks `err.cause.message` for ECONNRESET — Drizzle wraps the real error in `.cause`, so the previous check on `err.message` never matched and the retry branch was never entered
- Fix: concurrent callers (scheduler + reminder nica + reminder nici) now share a single reconnect promise instead of each creating a duplicate pool
- Fix: keep-alive ping now proactively reconnects when it detects a failure, so the pool is ready before the next real query fires
- Improvement: keep-alive interval reduced from 4 minutes to 90 seconds to stay well within MySQL's idle connection timeout
- 66/66 tests passing

## v1.6.1 — Reliability fixes

- Fix: all bot commands (/log, /last, /today, /week, /summary) now use withRetry-wrapped DB helpers to survive ECONNRESET on idle connections
- Fix: feeding reminder now uses actual feed end time (leftEnd/rightEnd) instead of createdAt for elapsed time calculation
- Fix: DB connection retry now waits 500ms before reconnecting to allow pool to fully close
- Fix: ETIMEDOUT added to connection error detection alongside ECONNRESET/ECONNREFUSED
- Improvement: /last no longer requires a live DB connection for read queries (uses cached helpers)
- Tests: 66/66 passing; test mocks updated to reflect new helper-based architecture

## v1.6.0 — Quick-log mode

- Quick-log: `/log nica left` (no time range) records the current time as a point-in-time feed
- Dashboard: feed count is the primary metric; quick-log entries shown as ⚡ Left / ⚡ Right
- Dashboard: "Last fed" stat card now shows "X ago" sub-label
- Voice: quick-log phrases work naturally ("log nica left" without a time)
- Vitamin D tracking: `/log nica vitd` with 2-hour reminders after noon
- Vitamin D calendar in dashboard (green tick / red cross per day)
- DB keep-alive ping every 4 minutes to prevent ECONNRESET
- Feeding reminder fix: now uses withRetry for reliable delivery
- /help updated in EN/DE/UK with quick-log examples

## v1.5.0
- Added /version command: shows current version, uptime, and build date
- Added voice message support: send a voice note to the bot and it transcribes and executes the command
- Deployment notification: bot posts a message on every new production deploy
- CHANGELOG.md added to track all releases

## v1.4.0
- Fix: bottle ml parser no longer picks up hour from time range (e.g. 19:25-19:30)
- Added /settings bot command with link to dashboard settings page
- Added Log Entry modal in dashboard (feeding + diaper)
- Settings page now accessible via gear icon in dashboard header
- /help updated with /settings docs in EN/DE/UK

## v1.3.0
- Timezone fix: all times now interpreted as Vienna (Europe/Vienna) instead of server timezone
- /last command now shows last diaper change per child
- /last now supports optional child filter: /last nica or /last nici
- Bottle feeding details (ml, type) shown in /last output
- /help updated with /last nica|nici syntax

## v1.2.0
- Edit and delete entries from the analytics dashboard timeline
- Weekly chart view added to dashboard
- Bottle feeding (own milk, formula, generic) support in /log
- /today and /week commands added

## v1.1.0
- Dashboard analytics with daily feeding and diaper summary
- Feeding reminder: bot notifies after 3 hours without a feeding
- Daily digest scheduled via /settings
- Multi-language support: EN, DE, UK

## v1.0.0
- Initial release: /log, /delete, /last, /help commands
- Breast feeding logging (left, right, both)
- Diaper change logging
- Telegram bot webhook integration
