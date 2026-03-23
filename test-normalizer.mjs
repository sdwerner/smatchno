// Test the normalizeVoiceTranscription logic
function normalizeVoiceTranscription(raw) {
  let s = raw.trim().toLowerCase();
  const hadSlash = s.startsWith('/');
  if (hadSlash) s = s.slice(1);

  // Strip trailing punctuation (Whisper always adds it)
  s = s.replace(/[.!?,;]+$/, '');

  s = s.replace(/^(lock|lok|lug|lag|lop|loch|logg|logs|loge|log)\b/, 'log');
  s = s.replace(/^(delet|deleat|dileet|deletee)\b/, 'delete');
  s = s.replace(/^(to day|to-day|heute)\b/, 'today');
  s = s.replace(/^(lust|las|lest|letzte[rs]?)\b/, 'last');
  s = s.replace(/^(wick|wik|woche)\b/, 'week');
  s = s.replace(/^(sumary|summery|somary|sumery)\b/, 'summary');
  s = s.replace(/^(vershion|verson)\b/, 'version');
  s = s.replace(/^(seetings|setings|einstellungen)\b/, 'settings');
  s = s.replace(/^(hilfe|допомога)\b/, 'help');

  if (/^(status|what'?s? the status|show status)/.test(s)) s = 'last';
  if (/^(today|сьогодні)$/.test(s)) s = 'today';
  if (/^(last|останнє|останній)$/.test(s)) s = 'last';
  if (/^(week|тиждень)$/.test(s)) s = 'week';
  if (/^help$/.test(s)) s = 'help';

  s = s.replace(/\bnika\b/g, 'nica');
  s = s.replace(/\bnicky\b/g, 'nici');
  s = s.replace(/\b(diary|diper|diapper|nappy)\b/g, 'diaper');
  s = s.replace(/\b(whet|wett)\b/g, 'wet');
  s = s.replace(/\b(durty|dirtee)\b/g, 'dirty');
  s = s.replace(/\b(lef|lft)\b/g, 'left');
  s = s.replace(/\b(rite|righ)\b/g, 'right');
  s = s.replace(/\b(bot|bott)\b/g, 'both');
  s = s.replace(/\b(oun|owne)\b/g, 'own');
  s = s.replace(/\b(bottel|botle)\b/g, 'bottle');
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+to\s+(\d{1,2}(?::\d{2})?)/g, '$1-$2');
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+bis\s+(\d{1,2}(?::\d{2})?)/g, '$1-$2');

  return `/${s}`;
}

const tests = [
  ['Last.',                        'last'],
  ['Last',                         'last'],
  ['last.',                        'last'],
  ['Last!',                        'last'],
  ['Last status.',                 'last'],
  ['Status.',                      'last'],
  ['Lock nica left 9 to 9:30.',    'log'],
  ['Log nica left 9 to 9:30.',     'log'],
  ['Today.',                       'today'],
  ['Help.',                        'help'],
  ['Heute.',                       'today'],
  ['Letzte.',                      'last'],
  ['Letzter.',                     'last'],
  ['Woche.',                       'week'],
  ['Hilfe.',                       'help'],
  ['Log nika diary wet.',          'log'],
  ['Log nica diaper wet.',         'log'],
  ['Log nica left 9-9:30.',        'log'],
  ['Today',                        'today'],
  ['Week.',                        'week'],
];

let pass = 0, fail = 0;
for (const [input, expectedCmd] of tests) {
  const result = normalizeVoiceTranscription(input);
  const [cmd] = result.slice(1).split(/\s+/);
  const ok = cmd === expectedCmd;
  if (ok) pass++; else fail++;
  const status = ok ? '✅' : '❌';
  const extra = ok ? '' : `  (expected: ${expectedCmd})`;
  console.log(`${status} ${JSON.stringify(input).padEnd(38)} -> ${result.padEnd(32)} cmd: ${cmd}${extra}`);
}
console.log(`\nResult: ${pass}/${tests.length} passed`);
if (fail > 0) process.exit(1);
