/**
 * 이름 맞추기 (P0)
 * =====================================================================
 * 즐겨찾기 export · 입결(data/ipgyeol.json) · 모집요강(data/mojip2027.json)이
 * 같은 대학·학과를 서로 다르게 부른다. 세 표기를 하나로 맞춘다.
 *
 *   즐겨찾기   부산외국어대학교(부산)   통합모집(자유전공)
 *   입결       부산외대                자유전공학부
 *   모집요강   부산외대                자유전공
 *
 * 학과 정규화는 scripts/build_xref.py 의 norm_dept 와 **같은 규칙**이다.
 * 한쪽을 고치면 다른 쪽도 고쳐야 하고, board/match.test.mjs 가 그걸 지킨다.
 *
 * 원칙 — 오연결이 미연결보다 나쁘다.
 * 애매하면 잇지 않고 「연결 안 됨」으로 남긴다. 값을 지어내지 않는다.
 */

/* ── 대학 ─────────────────────────────────────────────────────────── */

/** 즐겨찾기의 정식 명칭을 입결·모집요강 쪽 축약형으로 줄인다. */
const ABBR = [
  ['교육대학교', '교대'], ['여자대학교', '여대'], ['외국어대학교', '외대'],
  ['과학기술대학교', '과기대'], ['공과대학교', '공대'], ['해양대학교', '해양대'],
];

/**
 * 캠퍼스 표기가 앞글자 축약으로 안 되는 것들.
 * (글로컬→글, 세종→세, 천안→천 처럼 앞글자로 되는 건 규칙이 처리한다)
 */
const CAMPUS_ALIAS = { ERICA: '에', 에리카: '에', WISE: 'W', 와이즈: 'W' };

/** 대학명 → 캠퍼스를 뺀 기준형. `국립` 접두는 붙은 채로 둔다(§resolveUniv 에서 양쪽 다 본다). */
export function univStem(name) {
  let n = String(name || '').trim();
  n = n.replace(/\s*[-–—]\s*.*$/, '');     // "한국외국어대학교(용인) - 글로벌캠퍼스"
  n = n.replace(/\(.*$/, '').trim();       // 캠퍼스 괄호
  for (const [long, short] of ABBR) {
    if (n.endsWith(long)) return (n.slice(0, -long.length) + short).replace(/\s/g, '');
  }
  return n.replace(/대학교$/, '대').replace(/\s/g, '');
}

/**
 * 대학명에 붙은 캠퍼스 후보를 **모두** 뽑는다.
 * `한국외국어대학교(용인) - 글로벌캠퍼스` 처럼 괄호에는 지역이, 꼬리표에 캠퍼스가
 * 들어가는 경우가 있어서 하나만 보면 틀린다.
 */
export function campusTokens(name) {
  const s = String(name || '');
  const raw = [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  const tail = s.match(/[-–—]\s*(.+)$/);
  if (tail) raw.push(tail[1].trim());
  const out = [];
  for (const t of raw) {
    if (!t) continue;
    const alias = CAMPUS_ALIAS[t] || CAMPUS_ALIAS[t.replace(/캠퍼스$/, '')];
    out.push(alias || t.replace(/캠퍼스$/, ''));
  }
  return out;
}

/** 첫 캠퍼스 후보. 표시가 없으면 null. */
export function campusOf(name) {
  return campusTokens(name)[0] || null;
}

/**
 * 자료 쪽 대학명 목록에서 가장 맞는 것을 고른다.
 * @param {string} name  즐겨찾기 표기
 * @param {Map<string,string[]>} index  univStem(자료명) → 자료명들. buildUnivIndex() 참고
 * @return {?string} 자료 쪽 이름. 못 고르면 null
 */
export function resolveUniv(name, index) {
  const stem = univStem(name);
  const campuses = campusTokens(name);
  // 입결은 `국립금오공대`처럼 국립을 유지하기도 하고 안 하기도 한다. 둘 다 본다.
  const tries = [stem, stem.startsWith('국립') ? stem.slice(2) : '국립' + stem];
  for (const t of tries) {
    const list = index.get(t);
    if (!list || !list.length) continue;
    if (list.length === 1) return list[0];
    // `(글)`은 `글로컬`·`글로벌`의 앞글자다. 자료 쪽 표시가 export 토큰의 앞부분이면 같은 캠퍼스로 본다.
    for (const campus of campuses) {
      const hit = list.find((full) => {
        const mark = (full.match(/\(([^)]*)\)/) || [])[1];
        return mark && (campus === mark || campus.startsWith(mark));
      });
      if (hit) return hit;
    }
    // 캠퍼스를 못 가리면 본교(괄호 없는 이름)로 둔다. 본교가 없으면 포기한다.
    const bare = list.find((full) => !full.includes('('));
    if (bare) return bare;
    return null;
  }
  return null;
}

/** 자료 쪽 대학명 배열 → univStem 색인 */
export function buildUnivIndex(names) {
  const index = new Map();
  for (const n of names) {
    const stem = String(n).replace(/\(.*$/, '');
    if (!index.has(stem)) index.set(stem, []);
    index.get(stem).push(n);
  }
  return index;
}

/* ── 학과 ─────────────────────────────────────────────────────────── */

/**
 * 괄호 안 내용 중 '다른 학과'를 뜻하는 구분자.
 * 이걸 지우면 한의예과(인문)과 한의예과(자연)이 같은 키가 되어 엉뚱한 입결이 붙는다.
 * scripts/build_xref.py 의 DISCRIMINATORS 와 같아야 한다.
 */
const DISCRIMINATORS = {
  인문: '인문', 인문계열: '인문', 인문사회: '인문', '인문·예능': '인문',
  자연: '자연', 자연계열: '자연', '자연·예능': '자연',
  예체능: '예체능', 예능: '예체능',
  야: '야', 야간: '야', 남: '남', 여: '여',
  '5년제': '5년', '4년제': '4년', '2년제': '2년', '6년제': '6년',
};

/** 학과명 정규화. 괄호 설명은 지우되 학과를 가르는 구분자는 키에 남긴다. */
export function normDept(name) {
  let d = String(name || '').trim();
  d = d.replace(/^\[[^\]]*\]/, '');                  // [통합], [유형2]
  const discs = [...new Set(
    [...d.matchAll(/\(([^)]*)\)/g)]
      .map((m) => DISCRIMINATORS[m[1].trim()])
      .filter(Boolean),
  )].sort();
  d = d.replace(/\([^)]*\)/g, '');
  d = d.replace(/[\s·，,／/‧・]/g, '');
  d = d.replace(/(전공|학과|학부|과|계열|학|부)$/, '');
  return d + (discs.length ? '~' + discs.join('') : '');
}

export function key(univ, dept) {
  return `${univ}|${normDept(dept)}`;
}

/** 통합·자유전공처럼 여러 학과를 아우르는 모집단위인가 */
const UMBRELLA = /자유전공|자율전공|통합모집|무전공|융합인재|자율학부|학부대학/;
export function isUmbrella(dept) {
  return UMBRELLA.test(String(dept || ''));
}

/* ── 연결 ─────────────────────────────────────────────────────────── */

/**
 * 지원 한 건에 입결·모집요강을 붙인다.
 *
 * @param {Object} app   Application (CONTRACT.md §2.2)
 * @param {Object} src   { ipgyeol:{index,byKey}, mojip:{index,byKey}, related:Map }
 * @return {Object} Link (CONTRACT.md §2.3)
 */
export function link(app, src) {
  const none = (why) => ({
    key: '', kind: 'univ', ipgyeol: [], college: [], mojip: [],
    related: [], confidence: 'none', why,
  });

  if (app.univType === '전문대') return linkCollege(app, src, none);
  if (app.univType && app.univType !== '일반대') {
    return none(`${app.univType}는 입결 자료가 없어 직접 확인해야 합니다`);
  }

  const univ = resolveUniv(app.univ, src.ipgyeol.index);
  if (!univ) return none(`입결 자료에 「${app.univ}」를 찾지 못했습니다`);

  const k = key(univ, app.dept);
  const rows = (src.ipgyeol.byKey.get(k) || []).slice()
    .sort((a, b) => a.year - b.year);

  const mojipUniv = resolveUniv(app.univ, src.mojip.index);
  const mojip = mojipUniv ? (src.mojip.byKey.get(key(mojipUniv, app.dept)) || []) : [];

  // 통합·자유전공이면 함께 볼 학과를 같이 돌려준다
  const related = isUmbrella(app.dept)
    ? (src.related && src.related.get(k)) || []
    : [];

  if (rows.length) {
    return {
      key: k, kind: 'univ', ipgyeol: rows, college: [], mojip, related,
      confidence: 'exact',
      why: `${univ} · ${app.dept}`,
    };
  }
  if (related.length) {
    const borrowed = related.flatMap((rk) => src.ipgyeol.byKey.get(rk) || []);
    if (borrowed.length) {
      return {
        key: k, kind: 'univ', ipgyeol: [], college: [], mojip, related,
        confidence: 'loose',
        why: `통합 모집이라 관련 학과 ${related.length}곳의 입결을 함께 봅니다`,
      };
    }
  }
  return none(`${univ}에 「${app.dept}」 입결이 없습니다`);
}

/**
 * 전문대는 다른 자료를 본다 — College 저장소의 `data/departments.json`.
 * 3개년 경쟁률·평균등급·최저등급에 취업률·충원율·연계편입이 함께 온다.
 */
function linkCollege(app, src, none) {
  if (!src.college) return none('전문대 자료를 받는 중입니다');

  const univ = resolveUniv(app.univ, src.college.index);
  if (!univ) return none(`전문대 자료에 「${app.univ}」를 찾지 못했습니다`);

  const k = key(univ, app.dept);
  let rows = src.college.byKey.get(k) || [];

  // 즐겨찾기는 `간호학과(4년제)` 처럼 수업연한을 학과명에 넣는다. College 자료는
  // 그걸 `level` 이라는 별도 값으로 갖고 있어 이름만으로는 안 붙는다.
  // 구분자를 떼고 다시 찾은 뒤 수업연한으로 가린다.
  const years = (app.dept.match(/([2-6])\s*년제/) || [])[1];
  if (!rows.length && years) {
    const plain = key(univ, String(app.dept).replace(/\([2-6]\s*년제\)/g, ''));
    rows = (src.college.byKey.get(plain) || []).filter((r) => Number(r.level) === Number(years));
  }
  if (!rows.length) return none(`${univ}에 「${app.dept}」 자료가 없습니다`);

  return {
    key: k, kind: 'college', ipgyeol: [], college: rows, mojip: [], related: [],
    confidence: 'exact',
    why: `${univ} · ${app.dept}`,
  };
}

/** 연결 못한 것만 모은다. 미연결 큐 화면과 검증 요청에 쓴다. */
export function unlinked(apps, src) {
  return apps
    .map((app) => ({ app, link: link(app, src) }))
    .filter((x) => x.link.confidence === 'none');
}

/* ── 색인 만들기 ──────────────────────────────────────────────────── */

/**
 * data/ipgyeol.json 을 조회용 색인으로 바꾼다.
 * @param {{columns:string[], rows:Array}} doc
 */
export function indexIpgyeol(doc) {
  const c = Object.fromEntries(doc.columns.map((name, i) => [name, i]));
  const byKey = new Map();
  const names = new Set();
  for (const r of doc.rows) {
    const univ = r[c['대학']];
    names.add(univ);
    const k = key(univ, r[c['학과']]);
    const row = {
      univ, dept: r[c['학과']], year: r[c['연도']],
      cat: r[c['카테고리']], type: r[c['전형']], track: r[c['계열']],
      quota: r[c['모집']], rate: r[c['경쟁률']],
      g50: r[c['등급50']], g70: r[c['등급70']], applied: r[c['지원']],
      region: r[c['지역']],
    };
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }
  return { index: buildUnivIndex(names), byKey, univNames: [...names] };
}

/**
 * data/mojip2027.json 을 조회용 색인으로 바꾼다.
 * 문자열 사전 방식이라 textCols 에 든 열은 strings 에서 꺼내야 한다.
 */
export function indexMojip(doc) {
  const c = Object.fromEntries(doc.columns.map((name, i) => [name, i]));
  const text = new Set(doc.textCols || []);
  const S = doc.strings || [];
  const val = (r, name) => {
    const v = r[c[name]];
    if (v === null || v === undefined) return null;
    return text.has(name) ? S[v] : v;
  };
  const byKey = new Map();
  const names = new Set();
  for (const r of doc.rows) {
    const univ = val(r, '대학명');
    if (!univ) continue;
    names.add(univ);
    // 모집요강은 `모집단위`와 더 잘게 나눈 `세부모집단위`를 함께 준다.
    // 즐겨찾기 쪽 표기가 어느 쪽에 맞을지 모르므로 둘 다 색인해 둔다.
    const dept = val(r, '모집단위') || '';
    const sub = val(r, '세부모집단위') || '';
    const row = {
      univ, dept: sub || dept,
      type: val(r, '세부전형'), track: val(r, '계열'),
      quota: val(r, '모집2027'), quotaPrev: val(r, '모집2026'),
      rate26: val(r, '경쟁2026'), rate25: val(r, '경쟁2025'),
      cut70: val(r, '입결1_26'), cut50: val(r, '입결2_26'),
      filled26: val(r, '추합26'),
      minReq: val(r, '수능최저'), stages: val(r, '전형단계'),
      exam: val(r, '대학고사'), examWhen: val(r, '고사시기'),
      d1: val(r, '발표1단계'), dEssay: val(r, '논술일정'),
      dInterview: val(r, '면접일정'), dFinal: val(r, '합격자발표'),
      eligibility: val(r, '지원자격'),
    };
    for (const name of new Set([dept, sub].filter(Boolean))) {
      const k = key(univ, name);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(row);
    }
  }
  return { index: buildUnivIndex(names), byKey, univNames: [...names] };
}

/**
 * College 저장소의 학과 목록을 조회용 색인으로 바꾼다.
 * 같은 호스트(maechorom31-pixel.github.io)라 따로 받아 와도 출처가 같다.
 */
export function indexCollege(list) {
  const byKey = new Map();
  const names = new Set();
  for (const d of list || []) {
    const univ = d.college;
    if (!univ) continue;
    names.add(univ);
    const ip = d.ipgyeol || {};
    const row = {
      univ, dept: d.unit,
      region: d.sido, cat: d.cat2 || d.cat1, level: d.level,
      track: ip.track || null, phase: ip.phase || null,
      quota: ip.quota ?? null,
      comp: ip.comp || [],        // 3개년 경쟁률 (앞이 최신)
      avg: ip.avg || [],          // 3개년 최종등록자 평균등급
      min: ip.min || [],          // 3개년 최저등급
      trend: ip.trend ?? null,
      tracks: d.tracks || {},     // 전형 유형별 등급
      employ: d.employ ?? null,   // 취업률
      fill: d.fill ?? null,       // 충원율
      transfer: d.transfer ?? 0,  // 연계편입 경로 수
      tuition: d.tuition ?? null,
      change: d.change || null,
    };
    const kk = key(univ, d.unit);
    if (!byKey.has(kk)) byKey.set(kk, []);
    byKey.get(kk).push(row);
  }
  return { index: buildUnivIndex(names), byKey, univNames: [...names] };
}
