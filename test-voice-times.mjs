// Test script matching the exact normalizeVoiceTranscription logic in telegramBot.ts
function normalizeVoiceTranscription(raw) {
  let s = raw.trim().toLowerCase();
  const hadSlash = s.startsWith('/');
  if (hadSlash) s = s.slice(1);
  s = s.replace(/[.!?,;]+$/, '');

  s = s.replace(/^(lock|lok|lug|lag|lop|loch|logg|logs|loge|log)\b/, 'log');
  s = s.replace(/^(to day|to-day|heute)\b/, 'today');
  s = s.replace(/^(lust|las|lest|letzte[rs]?)\b/, 'last');
  s = s.replace(/^(wick|wik|woche)\b/, 'week');
  s = s.replace(/^(hilfe|допомога)\b/, 'help');
  if (/^(status|what'?s? the status|show status)/.test(s)) s = 'last';
  if (/^(last|останнє|останній)$/.test(s)) s = 'last';
  if (/^help$/.test(s)) s = 'help';

  s = s.replace(/\bnika\b/g, 'nica');
  s = s.replace(/\bnicky\b/g, 'nici');
  s = s.replace(/\b(diary|diper|diapper|nappy)\b/g, 'diaper');
  s = s.replace(/\b(whet|wett)\b/g, 'wet');
  s = s.replace(/\b(lef|lft)\b/g, 'left');
  s = s.replace(/\b(rite|righ)\b/g, 'right');
  s = s.replace(/\b(oun|owne)\b/g, 'own');
  s = s.replace(/\b(bottel|botle)\b/g, 'bottle');

  // EN number words
  const EN_NUMS = [
    [/\bzero\b/g, '0'], [/\bone\b/g, '1'], [/\btwo\b/g, '2'],
    [/\bthree\b/g, '3'], [/\bfour\b/g, '4'], [/\bfive\b/g, '5'],
    [/\bsix\b/g, '6'], [/\bseven\b/g, '7'], [/\beight\b/g, '8'],
    [/\bnine\b/g, '9'], [/\bten\b/g, '10'], [/\beleven\b/g, '11'],
    [/\btwelve\b/g, '12'],
    [/\bthirty\b/g, '30'], [/\bfifteen\b/g, '15'],
    [/\bforty[-\s]?five\b/g, '45'], [/\bforty\b/g, '40'],
    [/\btwenty[-\s]?five\b/g, '25'], [/\btwenty\b/g, '20'],
    [/\bfifty\b/g, '50'], [/\boh\b/g, '0'],
  ];
  for (const [re, digit] of EN_NUMS) s = s.replace(re, digit);

  // DE number words
  const DE_NUMS = [
    [/\bnull\b/g, '0'], [/\beins?\b/g, '1'], [/\bzwei\b/g, '2'],
    [/\bdrei\b/g, '3'], [/\bvier\b/g, '4'], [/\bfünf\b/g, '5'],
    [/\bsechs\b/g, '6'], [/\bsieben\b/g, '7'], [/\bacht\b/g, '8'],
    [/\bneun\b/g, '9'], [/\bzehn\b/g, '10'], [/\belf\b/g, '11'],
    [/\bzwölf\b/g, '12'],
    [/\bdrei(?:ß|ss)ig\b/g, '30'], [/\bfünfzehn\b/g, '15'],
    [/\bvierzig\b/g, '40'], [/\bfünfundvierzig\b/g, '45'],
    [/\bzwanzig\b/g, '20'],
  ];
  for (const [re, digit] of DE_NUMS) s = s.replace(re, digit);

  // half past / halb / quarter
  s = s.replace(/half past (\d{1,2})/g, '$1:30');
  s = s.replace(/half (\d{1,2})/g, '$1:30');
  s = s.replace(/halb (\d{1,2})/g, '$1:30');
  s = s.replace(/quarter past (\d{1,2})/g, (_, h) => `${h}:15`);
  s = s.replace(/quarter to (\d{1,2})/g, (_, h) => `${Math.max(0, parseInt(h) - 1)}:45`);
  s = s.replace(/viertel nach (\d{1,2})/g, (_, h) => `${h}:15`);
  s = s.replace(/dreiviertel (\d{1,2})/g, (_, h) => `${Math.max(0, parseInt(h) - 1)}:45`);

  // o'clock / uhr → strip
  s = s.replace(/(\d{1,2})\s+o'?\s*clock/g, '$1');
  s = s.replace(/(\d{1,2})\s+uhr/g, '$1');
  s = s.replace(/(\d{1,2})\s+година/g, '$1');

  // Bare hour + minute BEFORE range separators: "9 30" → "9:30"
  s = s.replace(/\b([01]?\d|2[0-3])\s+(0[0-9]|[1-5][0-9])\b/g, '$1:$2');

  // Range separators
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+to\s+(\d{1,2}(?::\d{2})?)/g, '$1-$2');
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+bis\s+(\d{1,2}(?::\d{2})?)/g, '$1-$2');
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+до\s+(\d{1,2}(?::\d{2})?)/g, '$1-$2');

  // Bare hour range: "9-10" → "9:00-10:00"
  s = s.replace(/(?<![:\d])(\d{1,2})-(\d{1,2})(?![:\d])/g, (m, a, b) => `${a}:00-${b}:00`);
  // "9:25-10" → "9:25-10:00"
  s = s.replace(/(\d{1,2}:\d{2})-(\d{1,2})(?![:\d])/g, '$1-$2:00');

  return `/${s}`;
}

const tests = [
  // o'clock variants
  ["Log nica left 9 o'clock to 9:30.",   '/log nica left 9-9:30'],
  ['Log nica left 9 o clock to 9:30.',   '/log nica left 9-9:30'],
  ['Log nica left 9 Uhr to 9:30.',       '/log nica left 9-9:30'],

  // Spoken number words (EN)
  ['Log nica left nine to nine thirty.',       '/log nica left 9-9:30'],
  ['Log nica left ten to ten thirty.',         '/log nica left 10-10:30'],
  ['Log nica left eleven to eleven fifteen.',  '/log nica left 11-11:15'],

  // half past
  ['Log nica left half past nine to ten.',     '/log nica left 9:30-10:00'],
  ['Log nica left half nine to ten.',          '/log nica left 9:30-10:00'],

  // quarter past / to
  ['Log nica left quarter past nine to nine thirty.',  '/log nica left 9:15-9:30'],
  ['Log nica left quarter to ten to ten.',             '/log nica left 9:45-10:00'],

  // Bare hour range
  ['Log nica left 9 to 10.',   '/log nica left 9:00-10:00'],
  ['Log nica left 10 to 11.',  '/log nica left 10:00-11:00'],

  // Mixed: HH:MM start, bare hour end
  ['Log nica left 9:25 to 10.', '/log nica left 9:25-10:00'],

  // German number words (use dreissig as ASCII fallback - bot also handles ß)
  ['Log nica links neun bis neun dreissig.', '/log nica links 9-9:30'],

  // Already correct (should pass through)
  ['Log nica left 9:00-9:30.',   '/log nica left 9:00-9:30'],
  ['Log nica left 10:15-11:00.', '/log nica left 10:15-11:00'],

  // Existing regression tests
  ['Last.',    '/last'],
  ['Status.',  '/last'],
  ['Today.',   '/today'],
  ['Help.',    '/help'],
];

let pass = 0, fail = 0;
for (const [input, expected] of tests) {
  const result = normalizeVoiceTranscription(input);
  const ok = result === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} ${JSON.stringify(input).padEnd(55)} -> ${result}`);
  if (!ok) console.log(`   expected: ${expected}`);
}
console.log(`\nResult: ${pass}/${tests.length} passed`);
if (fail > 0) process.exit(1);
