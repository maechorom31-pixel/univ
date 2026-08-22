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

/**
 * 전형 이름 정규화.
 *
 * 입결 자료의 전형 이름이 해마다 조금씩 달라진다. 같은 전형인데
 *
 *     교과(일반)        ↔  교과(일반전형)
 *     교과일반          ↔  교과(일반전형)
 *     종합(고교생활Ⅰ)   ↔  종합(고교Ⅰ)
 *     교과(지역)        ↔  교과(지역인재)
 *
 * 처럼 갈린다. 전형이 둘 이상인 (대학·학과) 7,550 곳 가운데 **25.8%** 가 이렇다.
 * 그대로 두면 연도별 추이가 한 해씩 토막 나고, 「해마다 얼마나 움직였나」도 못 잰다.
 *
 * 다만 **적게 지운다.** 교과와 종합, Ⅰ과 Ⅱ, 지역과 학교장추천은 서로 다른 전형이라
 * 절대 합치면 안 된다. 붙었다 떨어졌다 하는 꼬리(전형·선발·우수자·생활·인재)만 턴다.
 *
 * 로마 숫자만 아라비아로 바꾼다. `종합(고교Ⅱ)` 와 `종합(고교2)` 는 같은 전형인데
 * 글자로는 안 겹친다. Ⅰ↔Ⅱ 는 여전히 1↔2 로 갈리니 서로 다른 전형은 그대로 갈린다.
 *
 * `학생부` 는 `학생` 보다 먼저 턴다. 뒤에 두면 `학생부교과` 가 `부교과` 로 남아
 * 즐겨찾기의 `학생부교과(일반전형)` 와 입결의 `교과(일반)` 이 안 붙는다.
 */
const TYPE_NOISE = /(학생부|전형|선발|우수자|생활|인재|학생|모집)/g;
const ROMAN = { 'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5', 'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3' };
export function normType(name) {
  return String(name || '')
    .replace(/[ⅠⅡⅢⅣⅤⅰⅱⅲ]/g, (c) => ROMAN[c])
    .replace(/[\s()[\]·・,／/]/g, '')
    .replace(TYPE_NOISE, '')
    .trim();
}

export function key(univ, dept) {
  return `${univ}|${normDept(dept)}`;
}

/** 통합·자유전공처럼 여러 학과를 아우르는 모집단위인가 */
const UMBRELLA = /자유전공|자율전공|통합모집|무전공|융합인재|자율학부|학부대학/;
export function isUmbrella(dept) {
  return UMBRELLA.test(String(dept || ''));
}

/* ── 자유전공 · 학과통합 ──────────────────────────────────────────── */

/**
 * 모집요강의 `[유형1] …` `[유형2] …` 꼬리표.
 *
 *   유형1  전공을 정하지 않고 뽑는다 — 세부모집단위에 **대학의 거의 모든 학과**가 적힌다
 *   유형2  계열·단과대 단위로 묶는다 — 묶인 학과들만 적힌다
 *
 * 둘 다 세부모집단위가 「잘게 나눈 이름」이 아니라 **묶이기 전 학과 목록**이다.
 */
const FREE_TAG = /^\[(유형\d)\]\s*/;

/** 이전 학과 목록을 쪼갠다. 자료가 쉼표와 빗금을 섞어 쓴다. */
export function splitDepts(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const list = raw
    .split(/\s*[,/]\s*/)
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 40);
  // 괄호가 열린 채 잘린 조각(`생명산업과학분야(농생명과학전공` 같은 것)은 버린다
  const clean = list.filter((t) => (t.match(/\(/g) || []).length === (t.match(/\)/g) || []).length);
  return clean.length ? clean : null;
}

/**
 * 꼬리표 없이도 세부모집단위가 학과 목록인 경우가 있다
 * (`기계공학과, 신소재공학과, …` 처럼). 이걸 학과명으로 쓰면 200자짜리 키가 생긴다.
 *
 * 보수적으로 본다 — 셋 이상으로 쪼개지고, 조각 대부분이 학과 이름꼴일 때만.
 */
const DEPT_TAIL = /(학과|학부|전공|계열|과|부)$/;
function looksLikeList(text) {
  const list = splitDepts(text);
  if (!list || list.length < 3) return null;
  const named = list.filter((t) => DEPT_TAIL.test(t)).length;
  return named >= Math.ceil(list.length * 0.7) ? list : null;
}

/** 즐겨찾기의 전형유형 → 입결의 카테고리. 못 가리면 null. */
export function catOf(typeCat) {
  const t = String(typeCat || '');
  if (/논술/.test(t)) return '논술';
  if (/실기|실적|특기/.test(t)) return '실기';
  if (/교과/.test(t)) return '교과';
  if (/종합/.test(t)) return '종합';
  return null;
}

const mid = (list) => {
  const a = [...list].sort((x, y) => x - y);
  const h = Math.floor(a.length / 2);
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
};

/**
 * 실질경쟁률 — 못 구하면 사유를 함께 돌려준다.
 *
 *     실질경쟁률 = 명목경쟁률 × 모집인원 ÷ (모집인원 + 추가합격인원)
 *
 * planner.html 이 쓰던 식 그대로다. 모집인원 + 추가합격이 지원자 수보다 많으면
 * 추합란에 최종 인원이 아니라 누적 예비번호가 적힌 것이므로 계산하지 않는다.
 * 억지로 계산하면 1 미만이 나와 미달처럼 보인다.
 *
 * @return {{value: ?number, why: string}}
 */
export function realRate(nominal, quota, filled) {
  if (nominal == null || quota == null || filled == null) return { value: null, why: '' };
  if (nominal < 1) return { value: nominal, why: '미달이라 명목값을 그대로 씁니다' };
  const applicants = nominal * quota;
  if (quota + filled > applicants) {
    return { value: null, why: '추가합격이 누적 예비번호로 적힌 것으로 보여 계산하지 않았습니다' };
  }
  return { value: (nominal * quota) / (quota + filled), why: '' };
}

/**
 * 묶이기 전 학과들의 작년 선.
 *
 * 올해 새로 묶여 제 입결이 없는 모집단위를 볼 때 쓴다. **참고값이다.**
 * 묶은 뒤의 경쟁률과 컷은 대개 묶기 전과 다르게 나오므로 평균 하나로 줄이지 않고
 * 범위와 가운데값을 함께 준다. 어느 학과에서 왔는지도 그대로 돌려준다.
 *
 * 전형이 다르면 잣대가 다르다. 지원한 전형과 같은 카테고리(교과/종합/논술/실기)만
 * 본다. 그 카테고리가 하나도 없으면 빈손으로 돌아간다 — 종합 컷을 교과 지원자에게
 * 보여 주느니 아무것도 안 보이는 편이 낫다.
 *
 * @param {string} univ   입결 쪽 대학명
 * @param {string[]} depts 묶이기 전 학과 이름들
 * @param {Object} ipgyeol {byKey}
 * @param {?string} cat   '교과' | '종합' | '논술' | '실기' | null(전부)
 * @return {?Object} { year, cat, found:[{dept,g70,rate,quota}], missing:[string],
 *                     g70:{lo,mid,hi}, rate:{lo,mid,hi}, quota }
 */
export function referenceLine(univ, depts, ipgyeol, cat) {
  if (!univ || !depts || !depts.length || !ipgyeol) return null;

  // 어느 해를 볼지는 자료가 정한다. 가장 최근 해만 본다.
  let year = 0;
  const bag = [];
  for (const d of depts) {
    const rows = ipgyeol.byKey.get(key(univ, d)) || [];
    for (const r of rows) if (r.year > year) year = r.year;
    bag.push([d, rows]);
  }
  if (!year) return null;

  const found = [];
  const missing = [];
  for (const [dept, rows] of bag) {
    const mine = rows.filter((r) => r.year === year && (!cat || r.cat === cat));
    const g70 = mine.map((r) => r.g70).filter((x) => x != null);
    const rate = mine.map((r) => r.rate).filter((x) => x != null);
    const quota = mine.map((r) => r.quota).filter((x) => x != null);
    if (!g70.length && !rate.length) { missing.push(dept); continue; }
    found.push({
      dept,
      g70: g70.length ? mid(g70) : null,
      rate: rate.length ? mid(rate) : null,
      quota: quota.length ? quota.reduce((a, b) => a + b, 0) : null,
    });
  }
  if (!found.length) return null;

  const spread = (pick) => {
    const v = found.map(pick).filter((x) => x != null);
    if (!v.length) return null;
    return { lo: Math.min(...v), mid: mid(v), hi: Math.max(...v), n: v.length };
  };
  const quotas = found.map((f) => f.quota).filter((x) => x != null);

  return {
    year, cat: cat || null,
    found: found.sort((a, b) => (a.g70 ?? 99) - (b.g70 ?? 99)),
    missing,
    g70: spread((f) => f.g70),
    rate: spread((f) => f.rate),
    quota: quotas.length ? quotas.reduce((a, b) => a + b, 0) : null,
  };
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
    related: [], before: null, confidence: 'none', why,
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
  const mojip = pickMojip(
    mojipUniv ? (src.mojip.byKey.get(key(mojipUniv, app.dept)) || []) : [],
    app,
  );

  /*
   * 자유전공·학과통합이면 모집요강이 **묶이기 전 학과 목록**을 갖고 있다.
   * 그걸로 작년 선을 그려 둔다. 제 입결이 있으면 그게 먼저고 이건 곁들임,
   * 없으면(올해 새로 묶였으면) 이것만 남는다. 어느 쪽이든 참고값이다.
   */
  const parts = (mojip.find((m) => m.parts && m.parts.length) || {}).parts || null;
  const free = (mojip.find((m) => m.free) || {}).free || null;
  const before = parts
    ? referenceLine(univ, parts, src.ipgyeol, catOf(app.typeCat))
    : null;

  // 통합·자유전공이면 함께 볼 학과를 같이 돌려준다
  const related = isUmbrella(app.dept)
    ? (src.related && src.related.get(k)) || []
    : [];

  const bundle = before ? { type: free, parts, line: before } : null;

  if (rows.length) {
    return {
      key: k, kind: 'univ', ipgyeol: rows, college: [], mojip, related,
      before: bundle, confidence: 'exact',
      why: `${univ} · ${app.dept}`,
    };
  }
  if (bundle) {
    return {
      key: k, kind: 'univ', ipgyeol: [], college: [], mojip, related,
      before: bundle, confidence: 'loose',
      why: `올해 새로 묶인 모집단위라 작년 입결이 없습니다.`
        + ` 묶이기 전 학과 ${bundle.line.found.length}곳의 선을 참고로 봅니다`,
    };
  }
  if (related.length) {
    const borrowed = related.flatMap((rk) => src.ipgyeol.byKey.get(rk) || []);
    if (borrowed.length) {
      return {
        key: k, kind: 'univ', ipgyeol: [], college: [], mojip, related,
        before: null, confidence: 'loose',
        why: `통합 모집이라 관련 학과 ${related.length}곳의 입결을 함께 봅니다`,
      };
    }
  }
  return none(`${univ}에 「${app.dept}」 입결이 없습니다`);
}

/**
 * 지원한 전형의 입결 줄만 고른다.
 * =====================================================================
 * 입결은 (대학·학과) 로만 묶여 있어서 한 학과에 전형이 여럿 들어 있다.
 * 학과키 9,825 곳 가운데 **73.0%** 가 가장 최근 해에만도 전형이 둘 이상이고,
 * 그 중 **23.6%** 는 전형끼리 70%컷이 1등급 넘게 벌어진다.
 *
 *     전남대 영어영문  2026  교과(일반) 3.20  ·  종합(고교생활Ⅰ) 3.58
 *     가천대 경영학과  2026  교과(학생부) 2.52  ·  종합(바람개비) 3.90
 *
 * 그래서 「연도순으로 정렬한 뒤 마지막 줄」을 쓰면 교과로 넣은 학생 카드에
 * 종합의 컷이 뜬다. 그럴듯한 숫자라 아무도 못 알아챈다. **오연결이 미연결보다 나쁘다.**
 *
 * 고르는 차례
 *
 *   exact  정규화한 이름이 같다
 *   near   한쪽이 다른 쪽을 감싼다. 겹치는 글자가 가장 긴 묶음이 **하나뿐**일 때만.
 *          겹침 길이로 재는 까닭 — `교과(일반)` 은 `일반` 도 감싼다. 길이를 안 보면
 *          `일반` 과 `교과일반` 이 비겨서 못 고른다.
 *   cat    이름은 못 맞췄지만 카테고리(교과/종합/논술/실기)가 같은 묶음이 하나뿐
 *   only   이 학과 입결에 전형이 애초에 하나뿐
 *   none   위 어느 것도 아니면 **고르지 않는다.** 컷·경쟁률·모집을 비운다.
 *
 * 돌려주는 것은 고른 묶음의 행들(연도 오름차순)과 어떻게 골랐는지다.
 * 나머지 전형도 버리지 않는다 — 연도별 추이는 여전히 전부 보여 준다.
 */
export function pickIpgyeol(rows, app) {
  const groups = new Map();
  for (const r of rows) {
    const k = normType(r.type) || '전형 미상';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const keys = [...groups.keys()];
  if (!keys.length) return { rows: [], fit: 'none', type: null };
  const take = (k, fit) => ({
    rows: groups.get(k).slice().sort((a, b) => a.year - b.year),
    fit,
    type: groups.get(k)[groups.get(k).length - 1].type,
  });

  const want = normType(app.typeSub) || normType(app.typeName);
  if (want) {
    if (groups.has(want)) return take(want, 'exact');
    // 겹치는 글자가 가장 긴 묶음. 비기면 고르지 않는다.
    let best = 0;
    let hit = [];
    for (const k of keys) {
      if (k.length < 2 || !(k.includes(want) || want.includes(k))) continue;
      const len = Math.min(k.length, want.length);
      if (len > best) { best = len; hit = [k]; } else if (len === best) hit.push(k);
    }
    if (hit.length === 1) return take(hit[0], 'near');
  }

  const cat = catOf(app.typeCat) || catOf(app.typeSub) || catOf(app.typeName);
  if (cat) {
    const hit = keys.filter((k) => groups.get(k).some((r) => r.cat === cat || String(r.type).includes(cat)));
    if (hit.length === 1) return take(hit[0], 'cat');
  }

  if (keys.length === 1) return take(keys[0], 'only');

  /*
   * 못 골랐으면 **무엇들 사이에서 못 골랐는지**를 함께 돌려준다.
   * 「가려내지 못했습니다」만 적으면 선생님은 표를 처음부터 훑어야 한다.
   * 같은 유형(교과/종합)의 이름만 추리면 대개 둘이라 눈으로 바로 고를 수 있다.
   */
  const near = cat ? keys.filter((k) => groups.get(k).some((r) => r.cat === cat)) : [];
  // 이름이 가장 많이 겹치는 것부터. 화면에서 잘리더라도 앞에 남는 것이 진짜 후보여야 한다.
  const overlap = (k) => (want && (k.includes(want) || want.includes(k))
    ? Math.min(k.length, want.length) : 0);
  const among = (near.length ? near : keys)
    .slice()
    .sort((a, b) => overlap(b) - overlap(a))
    .map((k) => groups.get(k)[groups.get(k).length - 1].type);
  return { rows: [], fit: 'none', type: null, among };
}

/**
 * 한 학과에 전형이 여럿이면 모집요강 행도 여럿이다. **지원한 전형과 같은 줄을 골라야 한다.**
 * 아무거나(첫 줄) 쓰면 종합으로 넣은 학생에게 교과의 작년 모집인원과 추합이 붙어,
 * 「30명 (작년 3명)」 같은 엉뚱한 증감이 뜬다.
 *
 * 이름이 딱 맞는 줄 → 카테고리(교과/종합/논술/실기)라도 맞는 줄 → 그래도 없으면 원래 순서.
 * 골라낸 줄을 앞으로 옮길 뿐 버리지는 않는다. 상세에서 나머지도 볼 수 있어야 한다.
 */
function pickMojip(rows, app) {
  if (rows.length < 2) return rows;
  const want = norm(app.typeSub) || norm(app.typeName);
  const cat = catOf(app.typeCat);
  const score = (r) => {
    const t = norm(r.type);
    if (want && t && (t === want || t.includes(want) || want.includes(t))) return 0;
    if (cat && r.type && String(r.type).includes(cat)) return 1;
    return 2;
  };
  return rows.map((r, i) => [score(r), i, r])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((x) => x[2]);
}

const norm = (s) => String(s || '').replace(/[\s()·]/g, '');

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
    before: null, confidence: 'exact',
    why: `${univ} · ${app.dept}`,
  };
}

/**
 * Link + Application → 화면이 쓰는 요약 한 덩이.
 *
 * 교사 보드와 학생 화면이 **같은 함수**를 본다. 예전에는 각자 요약을 만들다
 * 같은 지원이 두 화면에서 다른 숫자로 보일 수 있었다.
 *
 * `linked` 는 이 모집단위 제 입결이 있는가다. 올해 새로 묶인 자유전공처럼
 * 제 입결이 없어도 `before`(묶이기 전 학과들의 선)가 있을 수 있다. 다른 값이므로
 * 화면에서도 다르게 적는다.
 */
const NO_RATE = { value: null, why: '' };

export function summarize(l, app) {
  if (!l) return { linked: false, kind: 'univ', rows: [], before: null, real: NO_RATE, why: '자료를 받는 중입니다' };
  if (l.confidence === 'none') {
    return { linked: false, kind: l.kind, rows: [], before: null, real: NO_RATE, why: l.why };
  }

  if (l.kind === 'college') {
    const d = l.college[0];
    return {
      linked: true, kind: 'college', why: l.why, rows: l.college, before: null, real: NO_RATE,
      year: 2026,                      // College 자료는 앞이 최신 (2026·25·24)
      rate: d.comp[0] ?? null,
      avg: d.avg[0] ?? null,           // 최종등록자 평균등급
      cut: d.min[0] ?? null,           // 최저등급 — 일반대의 70컷에 해당하는 자리
      quotaNow: d.quota ?? null, quotaPrev: null, quota: d.quota ?? null,
      employ: d.employ ?? null, fill: d.fill ?? null,
      transfer: d.transfer || 0, track: d.track || null, trend: d.trend ?? null,
    };
  }

  const rows = l.ipgyeol;
  /*
   * 머리 숫자(컷·경쟁률·모집)는 **지원한 전형의 줄**에서만 온다.
   * 못 가려내면 비운다 — 옆 전형의 숫자를 대신 앉히지 않는다. pickIpgyeol 참고.
   */
  const picked = pickIpgyeol(rows, app || {});
  const mineRows = picked.rows;
  const latest = mineRows[mineRows.length - 1] || null;
  const mo = l.mojip[0] || null;
  return {
    linked: rows.length > 0, kind: 'univ', why: l.why, rows,
    mine: mineRows,                    // 지원한 전형의 줄만
    type: picked.type,                 // 입결 쪽 전형 이름 (즐겨찾기와 다를 수 있다)
    typeFit: picked.fit,               // exact | near | cat | only | none
    among: picked.among || null,       // 못 골랐을 때 후보로 남은 전형 이름들
    before: l.before,                  // {type:'유형2', parts, line} | null
    year: latest ? latest.year : null,
    rate: latest ? latest.rate : null,
    cut: latest && latest.g70 != null ? latest.g70 : null,
    cut50: latest && latest.g50 != null ? latest.g50 : null,
    quota: latest ? latest.quota : null,
    mojip: mo,
    // 모집인원 증감과 실질경쟁률은 모집요강에서 온다. 화면에서 다시 계산하지 않는다.
    quotaNow: app && app.quota != null ? app.quota : (mo ? mo.quota : null),
    quotaPrev: mo ? mo.quotaPrev : null,
    real: mo ? realRate(mo.rate26, mo.quotaPrev, mo.filled26) : NO_RATE,
    stages: mo ? mo.stages : null,
  };
}

/* ── 비슷한 학과 찾기 ─────────────────────────────────────────────── */

/**
 * 두 학과 이름이 얼마나 닮았나. 0(안 닮음) ~ 1(같음).
 *
 * 글자를 두 개씩 끊어(bigram) 견준다. 「전자컴퓨터공학부」와 「전자공학과」처럼
 * 앞뒤가 겹치는 이름을 잡기 위해서다. 편집거리는 짧은 한글 이름에서 잘 안 듣는다.
 */
export function similarity(a, b) {
  const x = normDept(a);
  const y = normDept(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const overlap = (A, B) => {
    let hit = 0;
    for (const g of A) if (B.has(g)) hit += 1;
    return (2 * hit) / (A.size + B.size);
  };

  const grams = (s) => {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
    if (!out.size) out.add(s);
    return out;
  };
  const dice = overlap(grams(x), grams(y));

  // 글자만 모아 견주는 값도 섞는다.
  // 「화공생명공학과」와 「생명화학공학과」는 같은 학과인데 글자 **차례**가 달라
  // 두 글자씩 끊어 보면 거의 안 겹친다. 낱글자로 보면 넷 중 넷이 겹친다.
  const chars = overlap(new Set(x), new Set(y));

  // 한쪽이 다른 쪽을 통째로 품으면(「간호」 ⊂ 「간호학」) 조금 올려 준다
  const nested = x.includes(y) || y.includes(x) ? 0.15 : 0;
  return Math.min(1, 0.6 * dice + 0.4 * chars + nested);
}

/**
 * 같은 대학 안에서 닮은 학과를 골라 온다. **고르지는 않는다** — 사람이 고른다.
 *
 * @param {Object} app  Application
 * @param {Object} src  { ipgyeol, college }
 * @param {number} n    몇 개까지
 * @return {Array<{dept, score, years, kind}>}
 */
export function candidates(app, src, n = 6) {
  const college = app.univType === '전문대';
  const bank = college ? src.college : src.ipgyeol;
  if (!bank) return [];

  const univ = resolveUniv(app.univ, bank.index);
  if (!univ) return [];

  // 이 대학의 학과 이름을 모은다
  const seen = new Map();
  for (const [k, rows] of bank.byKey) {
    if (!k.startsWith(`${univ}|`)) continue;
    for (const r of rows) {
      const name = r.dept;
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, new Set());
      if (r.year) seen.get(name).add(r.year);
    }
  }

  const out = [];
  for (const [dept, years] of seen) {
    const score = similarity(app.dept, dept);
    // 문턱을 낮게 둔다. 「화학공학과」와 「화공생명공학과」는 글자가 거의 안 겹치지만
    // 같은 학과일 수 있다. 후보를 감추느니 점수를 함께 보여 주고 사람이 고르게 한다.
    if (score < 0.15) continue;
    out.push({ dept, score, years: [...years].sort(), kind: college ? 'college' : 'univ' });
  }
  out.sort((a, b) => b.score - a.score || a.dept.localeCompare(b.dept, 'ko'));
  return out.slice(0, n);
}

/* ── 전형일정 (PDF 에서 뽑은 것) ─────────────────────────────────── */

/**
 * 전형일정표가 무엇을 채우는가.
 *
 * 모집요강의 면접일정은 확정이 13.3%뿐이고 9.6%는 기간으로만 적혀 있다.
 * 기간만으로는 학생 둘의 면접이 겹치는지 알 수 없다. 전형일정표(수박먹고 대학간다)는
 * **날짜별 고사표**를 따로 주는데, 거기서는 어느 대학이 며칠에 보는지가 한 줄로 나온다.
 *
 * 그래서 순서는 이렇다 — 날짜별 고사표 → 대학별 표의 자기 칸 → 모집요강.
 * 앞엣것이 있으면 뒤엣것을 보지 않는다.
 */
export function indexSchedule(doc) {
  const rows = new Map();        // univStem → [전형 행]
  const exams = new Map();       // univStem → [{date, type, kind}]
  const put = (map, name, value) => {
    const k = univStem(String(name || '') + (String(name || '').endsWith('대') ? '' : '대'));
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(value);
  };
  for (const r of (doc && doc.rows) || []) put(rows, r.univ, r);
  for (const e of (doc && doc.exams) || []) put(exams, e.univ, e);
  return { rows, exams, year: (doc && doc.year) || null };
}

/** 두 전형 이름이 같은 것을 가리키는가. 표기가 제각각이라 느슨하게 본다. */
function sameType(a, b) {
  const x = String(a || '').replace(/[\s()·\-전형]/g, '');
  const y = String(b || '').replace(/[\s()·\-전형]/g, '');
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * 이 지원의 고사일을 일정표에서 찾는다.
 *
 * **전형 이름이 맞을 때만** 이 지원의 날짜로 친다(`loose: false`).
 * 이름을 못 맞추면 같은 유형의 고사일을 `loose: true` 로 함께 돌려주되, 그건
 * 「이 대학 종합전형은 이때 본다」는 참고일 뿐 이 전형의 날짜가 아니다.
 *
 * 느슨한 값을 이 지원의 날짜로 쓰면, 면접이 아예 없는 서류형 전형에 면접일이 생기고
 * 그것 때문에 있지도 않은 겹침 경고가 뜬다. 이 도구에서 가장 나쁜 실패다.
 *
 * @return {?{from, to, fixed, type, kind, loose}}
 */
export function examDate(app, sched) {
  if (!sched) return null;
  const list = sched.exams.get(univStem(app.univ));
  if (!list || !list.length) return null;

  const cat = catOf(app.typeCat);
  const want = app.typeSub || app.typeName || '';

  const exact = list.filter((e) => sameType(e.type, want));
  const pool = exact.length ? exact : (cat ? list.filter((e) => e.kind === cat) : []);
  if (!pool.length) return null;

  const days = [...new Set(pool.map((e) => e.date))].sort();
  return {
    from: days[0], to: days[days.length - 1],
    fixed: days.length === 1,
    type: pool[0].type || '', kind: pool[0].kind || '',
    loose: !exact.length,
  };
}

/** 일정표의 고사 종류(면접·논술)가 이 지원의 전형 유형과 맞는가. */
export function examKindFits(app, kind) {
  const cat = catOf(app.typeCat);
  if (kind === '논술') return cat === '논술';
  if (kind === '실기') return cat === '실기';
  if (kind === '면접') return cat === '교과' || cat === '종합';
  return false;
}

/** 원서 마감 · 1단계 발표 · 최종 발표. 없으면 null. */
export function paperDates(app, sched) {
  if (!sched) return null;
  const list = sched.rows.get(univStem(app.univ));
  if (!list || !list.length) return null;

  const want = app.typeSub || app.typeName || '';
  const cat = catOf(app.typeCat);
  const hit = list.find((r) => sameType(r.type, want))
    || (cat ? list.find((r) => r.kind === cat) : null);
  if (!hit) return null;
  return {
    apply: hit.apply || null, applyClock: hit.applyClock || null,
    stage1: hit.stage1 || null, final: hit.final || null,
    notes: hit.notes || [], type: hit.type || '',
    loose: !sameType(hit.type, want),
  };
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
    const unit = val(r, '모집단위') || '';
    const sub = val(r, '세부모집단위') || '';
    // 자유전공(유형1·유형2)이면 세부모집단위가 잘게 나눈 이름이 아니라
    // **묶이기 전 학과들의 목록**이다. 그걸 학과명으로 쓰면 안 된다.
    const tag = unit.match(FREE_TAG);
    const parts = tag ? splitDepts(sub) : looksLikeList(sub);
    const bare = unit.replace(FREE_TAG, '').trim();
    const dept = parts ? bare : unit;
    const row = {
      univ, unit: bare, dept: parts ? bare : (sub || unit),
      free: tag ? tag[1] : null, parts,
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
    // 자유전공은 모집단위 이름으로만 건다. 이전 학과 목록으로 걸면
    // 그 학과를 따로 지원한 학생에게 엉뚱한 전형이 붙는다.
    const keys = parts ? [dept] : [dept, sub].filter(Boolean);
    for (const name of new Set(keys)) {
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
