// KYA name-extraction SQL + name-correlation helpers, shared between the
// /api/kya reads and the cross-linking summaries (mob detail, item detail).
// The ingest endpoint (POST /api/eq/kya) is untouched by all of this.
// See docs/kya.md for the three capture formats.

// SQL fragment that derives `pattern` (A/B/C/X) and `mob_name` from
// `info`. Three capture formats exist in kya_info — see docs/kya.md.
//   A: "<target> at <hp%>" (oldest, 5 rows). mob_name = first word.
//   B: "<Caster>'s\n<target> at <hp%>\n..." (the bulk).
//      mob_name = first line minus trailing 's.
//   C: "<Subject>'s gender is: ...|..." (consider output, pipe-joined).
//      mob_name = substring before "'s gender is:".
//   X: bad/incomplete row (id 405 only). mob_name = NULL, skipped.
export const EXTRACT_SQL = `
  CASE
    WHEN info LIKE '%\\'s gender is:%' THEN 'C'
    WHEN info REGEXP '^[A-Z][^\\n]*\\'s\\n' THEN 'B'
    WHEN info REGEXP '^[a-zA-Z]+ at ' THEN 'A'
    ELSE 'X'
  END AS pattern,
  CASE
    WHEN info LIKE '%\\'s gender is:%' THEN SUBSTRING_INDEX(info, '\\'s gender is:', 1)
    WHEN info REGEXP '^[A-Z][^\\n]*\\'s\\n' THEN TRIM(TRAILING '\\'s' FROM SUBSTRING_INDEX(info, '\\n', 1))
    WHEN info REGEXP '^[a-zA-Z]+ at ' THEN LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(info, '\\n', 1), ' at ', 1))
    ELSE NULL
  END AS mob_name
`;

// KYA names are player-typed; Mob KB names are curated and sometimes
// suffixed ("Balizaar 0%"). Strip a trailing percent tag so the KB name
// can meet the kya capture name.
export function kyaCandidateName(name) {
    return String(name || '').replace(/\s*\d+%$/, '').trim();
}

// How many kya_info captures exist per candidate name (case-insensitive).
// Returns Map(lowercased name → count). One scan of kya_info per call —
// same cost as GET /api/kya/mobs, fine at this table's scale (~3k rows).
export async function kyaCountsByNames(zeq, names) {
    const uniq = [...new Set(names.map(n => kyaCandidateName(n).toLowerCase()).filter(Boolean))];
    const out = new Map();
    if (!uniq.length) return out;
    const params = {};
    const ph = uniq.map((n, i) => {
        const p = 'kn' + String(i).padStart(4, '0');
        params[p] = n;
        return '@' + p;
    });
    const rows = await zeq.query(
        `SELECT LOWER(mob_name) AS n, COUNT(*) AS c
           FROM (SELECT info, ${EXTRACT_SQL} FROM kya_info) t
          WHERE mob_name IS NOT NULL AND LOWER(mob_name) IN (${ph.join(',')})
          GROUP BY LOWER(mob_name)`, params);
    for (const r of rows) out.set(r.n, Number(r.c) || 0);
    return out;
}
