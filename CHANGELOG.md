# Changelog

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
