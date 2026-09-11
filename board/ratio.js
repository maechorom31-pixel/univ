/**
 * 올해 최종 경쟁률 잇기 — 대학이 발표한 경쟁률을 지원 한 건에 붙인다
 * =====================================================================
 * `ratio.html` 이 대학 페이지에서 긁어 온 경쟁률을 보드의 지원에 붙인다. 붙으면
 * 내보내기의 「경쟁률」 칸이 저절로 찬다 — 학생이 카드에 적어 두기를 기다리지
 * 않아도 된다.
 *
 * **이 파일이 하는 일의 절반은 안 붙이는 것이다.** 옆 전형이나 옆 학과의 숫자가
 * 붙으면 상담에서 틀린 말을 하게 되고, 종이에는 그게 틀렸다고 아무 데도 안 적힌다.
 * 그래서 닮은 이름을 고르지 않는다 — 맞춤법이 어긋나면 그냥 비운다.
 *
 *   대학    이름을 정규화해 후보를 모으고, 후보가 여럿이면 캠퍼스 표기로만 가린다.
 *           못 가리면 포기한다 (「홍익대학교」 두 장은 자료에 아예 안 들어온다).
 *   전형    유형(교과·종합·논술·실기)이 같고 **정규화한 이름이 똑같은** 전형이
 *           하나일 때만. 이름이 유형뿐이면(「학생부교과」) 그 유형의 전형이
 *           하나뿐일 때만.
 *   모집단위 정규화한 이름이 **똑같은** 줄이 하나일 때만. 괄호 안까지 본다 —
 *           「건축학부」와 「건축학부(건축공학전공)」은 다른 모집단위다.
 *   모집인원 즐겨찾기와 대학 페이지가 둘 다 적었는데 다르면 **붙이되 표를 세운다**.
 *           대학·전형·모집단위가 셋 다 똑같이 맞은 줄이라 다른 학과일 가능성은
 *           낮고, 접수 중에 인원이 조정된 것이 흔하다. 다만 조용히 넘기지는
 *           않는다 — 내보내기 화면이 양쪽 인원을 나란히 적어 확인을 청한다.
 *
 * 못 붙인 것은 사유와 함께 돌려준다. 내보내기 화면이 그 목록을 보여 주고,
 * 담임이 카드에서 손으로 적으면 그 값이 언제나 먼저다.
 *
 * 자료는 `data/ratio/board.json` — `scripts/ratio_board.py` 가 스냅샷에서 접는다.
 * 대학이 적은 이름 그대로 들어 있고, 이름을 맞추는 일은 전부 여기서 한다.
 */

/* ── 이름 정규화 ────────────────────────────────────────────────── */

const ROMAN = { 'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4' };

/**
 * 대학 이름을 **몸통과 캠퍼스**로 가른다.
 *
 * 「대학교」·「대학」에서 자르는 것이 요령이다. 「건국대학교서울캠퍼스」의 어디까지가
 * 대학 이름이고 어디부터가 캠퍼스인지는 글자 수로는 못 가른다 —
 * 「국대학교서울」을 캠퍼스로 읽어 「건」만 남는 일이 생긴다.
 */
export function splitUniv(name) {
  const s = String(name || '').replace(/\s+/g, '');
  const m = s.match(/^(.*?(?:대학교|대학))(.*)$/);
  const head = m ? m[1] : s;
  const tail = m ? m[2] : '';
  let base = head.replace(/(대학교|대학)$/, '대').replace(/^국립/, '');
  base = base.replace(/여자대$/, '여대')
    .replace(/한국외국어대$/, '한국외대')
    .replace(/과학기술대$/, '과기대');
  const campus = tail.replace(/[（()）]/g, '').replace(/캠퍼스/g, '').trim();
  return { base, campus: campusWord(campus) };
}

/** 대학 이름에서 캠퍼스 표시만. 「고려대학교(서울)」·「건국대학교서울캠퍼스」 */
export function campusOf(name) {
  return splitUniv(name).campus;
}

/** 같은 캠퍼스를 다르게 적은 것들을 한 꼴로 모은다. */
function campusWord(w) {
  const s = String(w || '').replace(/캠퍼스$/, '');
  if (/^ERICA$/i.test(s) || s === '에리카') return 'ERICA';
  return s;
}

/** 대학 이름의 기본형. 캠퍼스·「국립」·띄어쓰기를 떼고 「대학교」를 「대」로 줄인다. */
export function univBase(name) {
  return splitUniv(name).base;
}

/**
 * 전형 이름의 기본형. 유형(교과·종합)은 따로 맞추므로 이름에서 뺀다.
 * `scripts/ratio_build.py` 의 `norm_track` 과 같은 규칙이다 — 한쪽만 고치면
 * 같은 전형이 서로 다른 이름이 된다.
 */
export function normTrack(name) {
  const raw = String(name || '');
  let t = raw.replace(/\s+/g, '');
  t = t.replace(/^[가-힣A-Za-z]{1,6}캠퍼스/, '');
  // 「학생부교과(일반고전형)_교과중심」 — 호남대 페이지가 전형 이름 뒤에 붙이는
  // 반영 방식 표시다. 전형 이름의 일부가 아니다.
  t = t.replace(/_[가-힣]{0,4}중심$/, '');
  t = t.replace(/실기\/?실적/g, '');
  t = t.replace(/전형기간자율화/g, '');
  t = t.replace(/(학생부교과|학생부종합|전형|위주|모집|정원내|정원외|학생부)/g, '');
  t = t.replace(/[（(](.*?)[)）]/g, '$1');
  t = t.replace(/(교과|종합)/g, '');
  t = t.replace(/[ⅠⅡⅢⅣ]/g, (m) => ROMAN[m]);
  t = t.replace(/[^0-9A-Za-z가-힣]/g, '');
  return t;
}

/** 「학생부교과」처럼 유형 이름뿐인 전형 표시인가. */
export function typeOnly(name) {
  return ['', '학생부', '교과', '종합', '논술', '실기', '실기실적'].includes(normTrack(name));
}

/** 전형 유형. 이름에 든 말로 가른다. */
export function kindOf(text) {
  const t = String(text || '').replace(/\s+/g, '');
  if (t.includes('학생부교과')) return '학생부교과';
  if (t.includes('학생부종합')) return '학생부종합';
  if (t.includes('논술')) return '논술';
  if (t.includes('실기') || t.includes('실적')) return '실기';
  if (t.includes('교과')) return '학생부교과';
  if (t.includes('종합')) return '학생부종합';
  return '기타';
}

/**
 * 모집단위 이름의 기본형. **괄호 안을 살린다** — 학부 안의 전공은 모집단위가
 * 따로라 경쟁률도 따로다. 괄호·붙임표·빗금을 가운뎃점 하나로 모아, 같은 학과를
 * 다르게 적은 것만 같아지게 한다.
 */
export function normUnit(name) {
  let s = String(name || '').replace(/\s+/g, '');
  s = s.replace(/[[［][^\]］]*[\]］]/g, '');
  s = s.replace(/[▲■★☆※◆●○△□▶▷*]/g, '');
  // 가운뎃점은 자료마다 글자가 다르다. 즐겨찾기는 「・」(U+30FB), 대학 페이지는
  // 「·」(U+00B7) 를 쓴다 — 같은 학과가 서로 다른 이름이 되던 자리다.
  s = s.replace(/[ㆍ・･•․‧∙⋅.]/g, '·');
  s = s.replace(/[-–—/()（）]/g, '·');
  s = s.replace(/·+/g, '·').replace(/^·|·$/g, '');
  s = s.replace(/(전공|과정)$/, '');
  return s;
}

/* ── 색인 ───────────────────────────────────────────────────────── */

/**
 * `data/ratio/board.json` → 찾아보기 좋은 꼴.
 *
 *   byBase   기본형 → 그 이름으로 온 대학들 (캠퍼스가 다른 여럿일 수 있다)
 *   dropped  자료에서 뺀 대학과 사유 (보드가 「손으로 보세요」라고 알린다)
 */
export function indexRatio(doc) {
  if (!doc || !Array.isArray(doc.univs)) return null;
  const byBase = new Map();
  for (const u of doc.univs) {
    const tracks = (u.t || []).map((t) => {
      const rows = new Map();
      for (const r of t.r || []) {
        const key = normUnit(r[0]);
        if (!key) continue;
        // 같은 이름이 둘이면 어느 것인지 모른다 — 둘 다 못 쓴다
        rows.set(key, rows.has(key) ? null : {
          unit: r[0], quota: r[1], applied: r[2], rate: r[3], sub: r[4] || '',
        });
      }
      return {
        name: t.n,
        kind: t.k || kindOf(t.n),
        norm: normTrack(t.n),
        // 캠퍼스는 자료가 적어 준다. 전남대 광주와 여수는 전형 이름이 똑같아서
        // 이것이 없으면 여수 지원자에게 광주 경쟁률이 붙는다.
        campus: campusWord(t.c || ''),
        rows,
      };
    });
    const entry = {
      univ: u.u, campus: campusOf(u.u), stamp: u.stamp || '', final: !!u.final,
      deadline: u.deadline || '', tracks,
    };
    const base = univBase(u.u);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(entry);
  }
  const dropped = new Map();
  for (const d of doc.dropped || []) dropped.set(univBase(d.u), d.why);
  return { built: doc.built || '', byBase, dropped };
}

/* ── 잇기 ───────────────────────────────────────────────────────── */

const fail = (reason, note) => ({ ok: false, reason, note: note || '' });

/** 지원의 대학이 자료의 어느 대학인가. 못 가리면 사유를 돌려준다. */
function pickUniv(index, app) {
  const base = univBase(app.univ);
  const cands = index.byBase.get(base);
  if (!cands || !cands.length) {
    const why = index.dropped.get(base);
    return why ? fail('univ', why) : fail('univ', '경쟁률 자료에 없는 대학입니다');
  }
  if (cands.length === 1) {
    const only = cands[0];
    const mine = campusOf(app.univ);
    // 자료 쪽이 캠퍼스를 적었는데 다른 캠퍼스면 남의 자료다
    if (only.campus && mine && only.campus !== mine) {
      return fail('univ', `자료는 ${only.univ} 것입니다`);
    }
    return { ok: true, univ: only };
  }
  const mine = campusOf(app.univ);
  const same = cands.filter((c) => c.campus && c.campus === mine);
  if (same.length === 1) return { ok: true, univ: same[0] };
  return fail('univ', `캠퍼스가 여럿입니다 — ${cands.map((c) => c.univ).join(' · ')}`);
}

/** 지원한 전형이 자료의 어느 전형인가. 이름이 똑같은 하나일 때만. */
function pickTrack(entry, app) {
  let tracks = entry.tracks;
  const campus = campusOf(app.univ);
  // 한 페이지에 캠퍼스가 나뉘어 있으면(전남대 광주·여수) 그 캠퍼스의 전형만 본다
  if (campus) {
    const here = tracks.filter((t) => t.campus === campus);
    if (here.length) tracks = here;
  }
  const kind = appKind(app);
  const sameKind = kind === '기타' ? tracks
    : tracks.filter((t) => t.kind === kind || t.kind === '기타');

  for (const probe of [app.typeSub, app.typeName]) {
    if (!probe) continue;
    if (typeOnly(probe)) continue;             // 유형뿐인 이름은 아래에서 따로
    const want = normTrack(probe);
    if (!want) continue;
    const hit = sameKind.filter((t) => t.norm === want);
    if (hit.length === 1) return { ok: true, track: hit[0], why: '전형 이름이 같음' };
    if (hit.length > 1) {
      return fail('track', `이름이 같은 전형이 ${hit.length}개입니다`);
    }
  }
  /*
   * 앞부분까지 같은 전형이 하나뿐이면 그것 — 다만 표를 세운다.
   *
   * 대학 페이지는 전형 이름 뒤에 권역을 붙이곤 한다(전북대 「지역인재1유형전형-호남권」).
   * 즐겨찾기에는 「지역인재전형 1유형」이라 적혀 있어 글자가 딱 떨어지지 않는다.
   * 앞부분이 같은 후보가 **하나뿐일 때만** 잇고, 화면에 양쪽 이름을 적어 확인을 청한다.
   * 둘 이상이면(「지역의사선발-광역권·군산권·…」) 고르지 않는다.
   */
  for (const probe of [app.typeSub, app.typeName]) {
    if (!probe || typeOnly(probe)) continue;
    const want = normTrack(probe);
    if (want.length < 2) continue;
    const hit = sameKind.filter((t) => t.norm.length >= 2
      && (t.norm.startsWith(want) || want.startsWith(t.norm)));
    if (hit.length === 1) {
      return { ok: true, track: hit[0], why: '전형 이름의 앞부분이 같고 후보가 하나',
        warn: { kind: 'track', mine: probe, theirs: hit[0].name } };
    }
    if (hit.length > 1) return fail('track', `앞부분이 같은 전형이 ${hit.length}개입니다`);
  }
  // 즐겨찾기가 「학생부교과」처럼 유형만 적어 둔 지원 — 그 유형이 하나뿐이면 그것
  if ([app.typeSub, app.typeName].every((x) => !x || typeOnly(x))) {
    const strict = kind === '기타' ? [] : tracks.filter((t) => t.kind === kind);
    if (strict.length === 1) return { ok: true, track: strict[0], why: '그 유형의 전형이 하나뿐' };
  }
  // 후보 이름을 다 늘어놓으면(원광대는 전형이 스무 남짓이다) 사유가 안 읽힌다
  const names = sameKind.map((t) => t.name);
  const shown = names.slice(0, 6).join(' · ') + (names.length > 6 ? ` 외 ${names.length - 6}` : '');
  return fail('track', names.length ? `맞는 전형이 없습니다 — 자료에는 ${shown}`
    : '자료에 같은 유형의 전형이 없습니다');
}

/** 지원의 전형 유형. 즐겨찾기의 세 칸을 차례로 본다. */
function appKind(app) {
  for (const x of [app.typeCat, app.typeSub, app.typeName]) {
    const k = kindOf(x);
    if (k !== '기타') return k;
  }
  return '기타';
}

/**
 * 지원 한 건에 올해 경쟁률을 붙인다.
 *
 *   { ok: true, rate, quota, applied, univ, track, campus, unit, stamp, final, why, warn }
 *   `warn` 은 「붙이긴 했으나 한 번 보아 주세요」 목록이다(전형 이름이 딱 떨어지지
 *   않음 · 모집인원이 다름). 화면이 그 줄을 따로 모아 보인다.
 *   { ok: false, reason: 'data'|'univ'|'track'|'unit', note }
 *
 * `final` 이 거짓이면 **아직 접수 중에 받아 둔 값**이다. 종이에는 싣지 않는다.
 */
export function rateOf(index, app) {
  if (!index) return fail('data', '경쟁률 자료를 아직 못 받았습니다');
  if (!app || !app.univ || !app.dept) return fail('data', '');

  const u = pickUniv(index, app);
  if (!u.ok) return u;
  const t = pickTrack(u.univ, app);
  if (!t.ok) return t;

  const key = normUnit(app.dept);
  const row = t.track.rows.get(key);
  if (row === null) return fail('unit', '같은 이름의 모집단위가 둘이라 가리지 못했습니다');
  if (!row) return fail('unit', `${t.track.name} 에 「${app.dept}」가 없습니다`);
  /*
   * 모집인원이 어긋나는 줄 — 붙이되 표를 세운다.
   *
   * 처음에는 여기서 버렸다. 그런데 여기까지 온 줄은 대학·전형·모집단위가 셋 다
   * 똑같이 맞았고 그 전형에 그 이름의 줄이 하나뿐인 것이다. 다른 학과일 가능성보다
   * 즐겨찾기의 인원이 대학 페이지와 다른 때의 것일 가능성이 훨씬 크다. 버리면
   * 맞는 값을 손으로 옮겨 적게 된다. 대신 `warn` 을 달아 화면이 양쪽 인원을
   * 나란히 보이고 확인을 청한다.
   */
  const warn = [];
  if (t.warn) warn.push(t.warn);
  if (app.quota != null && row.quota != null && Number(app.quota) !== Number(row.quota)) {
    warn.push({ kind: 'quota', mine: Number(app.quota), theirs: Number(row.quota) });
  }
  return {
    ok: true,
    rate: row.rate,
    quota: row.quota,
    applied: row.applied,
    univ: u.univ.univ,
    track: t.track.name,
    campus: t.track.campus,
    unit: row.unit,
    stamp: u.univ.stamp,
    final: u.univ.final,
    why: t.why,
    warn: warn.length ? warn : null,
  };
}
