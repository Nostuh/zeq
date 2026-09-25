// Pure-Node checks of the equipment merge policy in
// api/classes/eq_merge.mjs (no DB, no browser — cheap on this host).
//   node scripts/test/sanity_eq_merge.mjs
import { mergeRawInfo as m, mergeRecord, mergeMag } from '../../api/classes/eq_merge.mjs';

let fails = 0;
const t = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

t('raw: empty + text', m('', 'A'), 'A');
t('raw: text + empty', m('A', ''), 'A');
t('raw: both empty', m('', ''), null);
t('raw: same text re-paste is not duplicated', m('Boots\nIt has low AC.', 'Boots\nIt has low AC.'), 'Boots\nIt has low AC.');
t('raw: whitespace/CRLF-only difference is not duplicated', m('Boots\r\nIt has low AC.  ', 'Boots\nIt has   low AC.'), 'Boots\r\nIt has low AC.  ');
t('raw: subset re-paste keeps what is stored', m('lookup box\nline 2', 'line 2'), 'lookup box\nline 2');
t('raw: superset replaces', m('line 2', 'lookup box\nline 2'), 'lookup box\nline 2');
t('raw: distinct texts are BOTH kept (old rule dropped one)', m('LIBRARY BOX', 'IDENTIFY TEXT'), 'LIBRARY BOX\n\nIDENTIFY TEXT');
t('mag: larger magnitude wins, penalty kept', mergeMag(0, -5), -5);
t('mag: tie keeps existing', mergeMag(5, -5), 5);
t('mag: coerces strings/nulls', mergeMag('3', null), 3);
const r = mergeRecord(
    { str: 3, raw_info: 'LIB', bound: 0, needs_review: 0, hands: 1, eqmob_id: null },
    { str: 5, raw_info: 'ID', bound: 1, needs_review: 1, hands: 2, eqmob_id: 64 });
t('record: best stat, bound OR, review AND, hands max, provenance, texts kept',
    [r.str, r.bound, r.needs_review, r.hands, r.eqmob_id, r.raw_info], [5, 1, 0, 2, 64, 'LIB\n\nID']);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
