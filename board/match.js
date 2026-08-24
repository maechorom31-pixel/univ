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

/**
 * 즐겨찾기의 정식 명칭을 입결·모집요강 쪽 축약형으로 줄인다.
 *
 * 꼬리를 **`…대` 꼴로 적어 둔다.** 먼저 `대학교→대` 를 하고 나서 재기 때문이다.
 * 그래야 자료 쪽이 이미 줄여 적어 둔 이름(`서울과학기술대`)도 같은 자리로 온다.
 * 예전에는 `…대학교` 로만 재서, 모집요강의 `서울과학기술대` 가 즐겨찾기의
 * `서울과학기술대학교 → 서울과기대` 와 안 만났다.
 */
const ABBR = [
  ['교육대', '교대'], ['여자대', '여대'], ['외국어대', '외대'],
  ['과학기술대', '과기대'], ['공과대', '공대'], ['공학대', '공대'],
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
  n = n.replace(/대학교$/, '대').replace(/\s/g, '');
  for (const [long, short] of ABBR) {
    if (n.endsWith(long)) return n.slice(0, -long.length) + short;
  }
  return n;
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

/**
 * 자료 쪽 대학명 배열 → `univStem` 색인.
 *
 * **키를 만들 때도 `univStem` 을 태운다.** 조회 쪽(`resolveUniv`)이 `univStem` 결과로
 * 찾기 때문이다. 예전에는 괄호만 떼어 원문을 키로 썼는데, 그러면 자료 쪽 표기가
 * 이미 축약형일 때만 맞아떨어졌다.
 *
 *     입결      `서울과기대`        ← univStem('서울과학기술대학교') 와 같다  → 붙음
 *     모집요강  `서울과학기술대`     ← 축약이 안 되어 있다                    → 안 붙음
 *
 * 그래서 컷은 붙어 있는데 실질경쟁률·모집인원 증감·지원자격만 조용히 빠졌다.
 * 카드가 멀쩡해 보여서 더 위험했다. 입결에 있는 198개 대학 가운데 26곳이 이랬다.
 *
 * 원문 키도 함께 남긴다 — 자료 쪽이 이미 축약형이면 두 키가 같아 한 벌이고,
 * 다르면 어느 쪽으로 찾아도 붙는다. **버리는 것이 없다.**
 */
export function buildUnivIndex(names) {
  const index = new Map();
  const put = (k, n) => {
    if (!k) return;
    if (!index.has(k)) index.set(k, []);
    if (!index.get(k).includes(n)) index.get(k).push(n);
  };
  for (const n of names) {
    put(String(n).replace(/\(.*$/, ''), n);   // 원문(괄호만 뗀 것)
    put(univStem(n), n);                       // 축약형
    /*
     * `KAIST(한국과학기술원)` 처럼 **약칭이 밖에, 정식 이름이 괄호 안에** 있는 넷
     * (KAIST·GIST·DGIST·UNIST). 즐겨찾기는 정식 이름으로 적는다.
     * 밖이 로마자일 때만 본다 — `건국대(글)` 의 `글` 을 대학 이름으로 삼으면 안 된다.
     */
    const m = String(n).match(/^([A-Za-z]+)\(([^)]+)\)$/);
    if (m) put(univStem(m[2]), n);
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
  /*
   * 가운뎃점이 네 벌 섞여 있다 — `·`(U+00B7) 1,740 · `・`(U+30FB) 1,733 ·
   * `ㆍ`(U+318D) 356 · `‧`(U+2027) 147. 눈으로는 같은 글자다.
   * 한 벌이라도 빠뜨리면 `강원대 원예ㆍ농업자원경제학부` 와 `원예·농업자원경제학부` 가
   * 서로 다른 학과가 되어, 한 학과의 자료가 두 곳에 나뉜 채 각각 두 해씩만 남는다.
   * 14 쌍이 그렇게 갈려 있었다.
   */
  d = d.replace(/[\s·，,／/‧・ㆍ•∙‐‑‒–—]/g, '');
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
/*
 * **붙임표도 지운다.** `normDept` 에서 가운뎃점 네 벌을 안 지워 학과가 둘로 갈렸던
 * 것과 같은 종류의 구멍이다.
 *
 *     즐겨찾기  학생부종합(잠재능력우수자면접전형)  →  종합잠재능력면접
 *     입결      종합(잠재능력-면접)                →  종합잠재능력-면접   ← 안 맞는다
 *
 * 못 맞추면 `near` 가 대신 「감싸는 이름」을 찾는데, 하필 2022~2023년의
 * `종합(잠재능력)` 이 걸린다. 2024년에 면접·서류로 쪼개지기 **전** 전형이다.
 * 가톨릭대(성심) 영어영문학부가 컷 4.2(2026 면접) 대신 3년 묵은 줄을 달고 있었다.
 * **오연결이 미연결보다 나쁘다.**
 *
 * 지우고 재 봤다. 입결·모집요강 전형 이름 가운데 `normType` 을 거치고도 구두점이
 * 남는 것은 붙임표 129가지 · `+` 6 · `'` `⋅` `_` 각 1 이다. 다 지워도 **같은 해
 * 안에서 서로 다른 전형이 한 이름이 되는 일은 새로 생기지 않는다(72건 → 72건).**
 * 남은 72건은 붙임표와 무관한, `인재` 를 군더더기로 지우면서 생긴 옛 부딪힘이다
 * (`교과(지역인재)` 와 `교과(지역)` 이 한 해에 같이 있는 선문대·가톨릭관동대 꼴).
 * 대신 모집요강 전형 7가지가 비로소 입결과 맞는다 — 잠재능력 면접·서류 둘을 비롯해
 * `교과(지역인재(충북))` · `교과(일반[최저])` 따위다.
 */
/*
 * **쌍점도 지운다.** 즐겨찾기 export 가 「학생부교과:학교추천」처럼 쌍점으로 적는
 * 대학이 있다(고려대). 그러면 정규화한 이름이 `교과:학교추천` 이 되어 입결의
 * `교과학교장추천` 과 글자로 안 겹치고, `near` 도 못 잡아 카테고리로만 떨어진다.
 * 맞는 줄을 골라 놓고도 카드에는 「전형을 이름으로 맞추지 못했습니다」가 붙었다.
 *
 * 입결·모집요강 쪽 전형 이름 전체를 `normType` 에 넣어 보면 구두점이 **하나도**
 * 안 남는다. 즉 여기서 더 지워도 자료 쪽에서 새로 부딪힐 이름이 없다.
 */
export function normType(name) {
  return String(name || '')
    .replace(/[ⅠⅡⅢⅣⅤⅰⅱⅲ]/g, (c) => ROMAN[c])
    .replace(/[\s()[\]·・,／/]/g, '')
    .replace(/[‐‑‒–—―\-ㆍ•∙‧，⋅+_']/g, '')
    .replace(/[:;~|.!?*#&=<>"“”‘’%@^`{}]/g, '')
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
/**
 * 학교유형을 셋 중 하나로 줄인다 — `일반대` · `전문대` · `특수대`.
 *
 * 즐겨찾기가 무슨 말을 적어 둘지 미리 알 수 없다. 「대학교」·「4년제」·「전문대학」·
 * 「산업대학」… 해마다 다르고 시트마다 다르다. 그런데 코드 곳곳이 이 값을 **글자
 * 그대로** 견주고 있어서, 표기가 한 글자만 달라도 그 학생의 여섯 칸이 통째로
 * 미연결이 된다. 화면에는 「대학교는 입결 자료가 없습니다」라는 알 수 없는 말이 뜬다.
 *
 * 못 알아본 것은 `''` 로 돌려준다. **일반대로 단정하지 않는다** — 부르는 쪽이
 * 두 자료를 다 뒤지게 하려는 것이다.
 */
export function univKind(raw) {
  const t = String(raw || '').replace(/\s/g, '');
  if (!t) return '';
  if (/전문대|산업대|기능대|폴리텍/.test(t)) return '전문대';
  if (/사관|경찰대|특수대|각종학교|기술대/.test(t)) return '특수대';
  if (/일반대|4년제|사년제|대학교$/.test(t)) return '일반대';
  return '';
}

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
  /*
   * **「입결이 없다」와 「모집요강도 없다」는 다른 사실이다.**
   *
   * 예전에는 입결을 못 붙이면 그 자리에서 끊어서, 이미 찾아 둔 모집요강까지 같이
   * 버렸다. 그래서 신설학과(모집요강에만 있는 학과키가 867개다) 카드에서
   * 수능최저·지원자격·모집인원·전형단계가 통째로 사라지고, 수능최저 칸은
   * 「적혀 있지 않습니다」라고 **잘못** 말했다. 모집요강에는 적혀 있는데도.
   *
   * 자료가 제일 필요한 카드가 제일 빈 카드가 됐다. 그래서 none 도 모집요강은 들고 온다.
   */
  const none = (why, mojip) => ({
    key: '', kind: 'univ', ipgyeol: [], college: [], mojip: mojip || [],
    related: [], before: null, confidence: 'none', why,
  });

  /** 입결과 무관하게 모집요강만 따로 찾는다. */
  const mojipOf = () => {
    const u = src.mojip && resolveUniv(app.univ, src.mojip.index);
    if (!u) return [];
    return pickMojip(src.mojip.byKey.get(key(u, app.dept)) || [], app);
  };

  const kind = univKind(app.univType);
  if (kind === '전문대') return linkCollege(app, src, none);
  if (kind === '특수대') {
    return none(`${app.univType}는 입결 자료가 없어 직접 확인해야 합니다`, mojipOf());
  }
  /*
   * `kind === ''` 은 즐겨찾기가 모르는 말을 적어 둔 것이다. 그때는 **두 자료를 다 뒤진다.**
   * 예전에는 「일반대가 아니면 자료 없음」으로 끊었는데, 어디가 export 의 학교유형
   * 표기가 조금만 달라도(「대학교」·「전문대학」) 그 학생의 여섯 칸이 통째로 미연결이
   * 되고, 화면에는 「대학교는 입결 자료가 없습니다」라는 알 수 없는 말만 떴다.
   * 대학 이름으로 찾는 것이라 엉뚱한 자료가 붙을 일은 없다 — 없으면 그냥 못 찾는다.
   */

  const univ = resolveUniv(app.univ, src.ipgyeol.index);
  if (!univ) {
    if (kind === '' && src.college && resolveUniv(app.univ, src.college.index)) {
      return linkCollege(app, src, none);
    }
    return none(`입결 자료에 「${app.univ}」를 찾지 못했습니다`, mojipOf());
  }

  const k = key(univ, app.dept);
  const rows = narrowDept((src.ipgyeol.byKey.get(k) || []).slice()
    .sort((a, b) => a.year - b.year), app);

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
  /*
   * **못 고른 것과 없는 것은 다르다.** `narrowDept` 가 갈래를 못 가려 비웠으면
   * 어떤 갈래가 있었는지 그대로 적어 준다. 「입결이 없습니다」라고만 하면
   * 선생님은 자료가 빠진 줄 알고 표를 처음부터 뒤진다 — 사실은 자료가 넘쳐서
   * 못 고른 것이고, 점검 화면에서 하나 고르면 그만이다.
   */
  if (rows.dropped && rows.dropped.length) {
    return none(
      `「${app.dept}」가 입결에는 ${rows.dropped.length}갈래로 나뉘어 있어 어느 것인지`
      + ` 가리지 못했습니다 — ${rows.dropped.slice(0, 4).join(' · ')}`
      + `${rows.dropped.length > 4 ? ' 외' : ''}. 점검에서 골라 주세요`,
      mojip,
    );
  }
  return none(`${univ}에 「${app.dept}」 입결이 없습니다`, mojip);
}

/*
 * **괄호 안 세부전공을 지운 대가를 여기서 치른다.**
 *
 * `normDept` 는 괄호를 통째로 턴다. 「경영학과(주간)」의 군더더기를 지우려던 것인데,
 * 진짜로 학과를 가르는 괄호까지 같이 지워졌다.
 *
 *     국민대  미래융합전공(A) 70컷 2.08 · 경쟁 8.7   ┐ 둘 다 키가 「미래융합」
 *             미래융합전공(B) 70컷 2.12 · 경쟁 4.7   ┘
 *     경북대  전자공학부            70컷 2.20        ┐ 둘 다 키가 「전자공」
 *             전자공학부(인공지능전공) 70컷 3.42      ┘  — 1.2등급 차이다
 *     한양대(E) LIONS자율전공학부(인문사회계열) 2.82  ┐ 「전계열」은 구분자 목록에
 *              LIONS자율전공학부(전계열)      2.56  ┘  없어서 같은 키가 된다
 *
 * 재 보니 **같은 대학·연도·전형 안에서 숫자까지 다른 채 한 키로 뭉개진 자리가
 * 961곳**이다(무해한 중복 1,565곳은 뺀 수다). 그중 하나가 아무 근거 없이 뽑혀
 * 카드에 붙고 있었다 — 김담유의 미래융합전공(A)에 (B)의 숫자가 붙어 있었다.
 *
 * 고르는 규칙은 하나다. **괄호까지 그대로 같은 줄이 있으면 그것만 본다.**
 * 없으면 **아무것도 안 고른다** — 오연결이 미연결보다 나쁘다. 못 고른 자리는
 * `dropped` 로 남겨 점검 화면이 「이 셋 중 어느 것입니까」라고 물을 수 있게 한다.
 *
 * 해마다 따로 잰다. 국민대는 2025년엔 (인문)·(자연)으로, 2026년엔 (A)·(B)로
 * 갈라 놓았다. 한 해에 갈래가 하나뿐이면 애초에 헷갈릴 것이 없어 그냥 둔다.
 */
function tightDept(name) {
  return String(name || '')
    .replace(/^\[[^\]]*\]/, '')
    .replace(/[\s·，,／/‧・ㆍ•∙‐‑‒–—―\-()[\]]/g, '')
    .toUpperCase();
}

function narrowDept(rows, app) {
  if (rows.length < 2) return rows;
  const want = tightDept(app.dept);
  const bucket = new Map();
  for (const r of rows) {
    const b = `${r.year}\u0001${normType(r.type)}`;
    if (!bucket.has(b)) bucket.set(b, []);
    bucket.get(b).push(r);
  }
  const out = [];
  const lost = [];
  for (const group of bucket.values()) {
    const names = [...new Set(group.map((r) => tightDept(r.dept)))];
    if (names.length < 2) { out.push(...group); continue; }
    const same = group.filter((r) => tightDept(r.dept) === want);
    if (same.length) { out.push(...same); continue; }
    // 갈래가 여럿인데 어느 것인지 말해 주는 것이 없다. 고르지 않는다.
    for (const r of group) if (!lost.includes(r.dept)) lost.push(r.dept);
  }
  out.sort((a, b) => a.year - b.year);
  if (lost.length) out.dropped = lost;
  return out;
}

/**
 * 한 학과의 입결 행을 **전형 묶음**으로 가른다.
 * =====================================================================
 * `normType` 으로 한 번 묶고, 그 다음 **이름이 바뀐 것끼리 잇는다.**
 *
 *     고려대 경제  교과(추천) 2022~2025  →  교과(학교장추천) 2026
 *     가천대 경영  바람개비  2023~2025  →  종합(바람개비)   2026
 *     경상국립대   교과(일반) …          →  교괴(일반전형)   (원본 오타)
 *
 * 잇는 조건 넷을 다 만족해야 한다.
 *
 *   1. 카테고리가 같다        교과와 종합은 애초에 견주지 않는다
 *   2. 해가 안 겹치고 이어진다  한쪽 마지막 해 + 1 = 다른 쪽 첫 해.
 *                            같은 해에 둘 다 있으면 이름만 바뀐 게 아니라 둘 다 있는 것이다
 *   3. 1:1 이다               앞도 뒤도 후보가 하나뿐일 때만. 이게 없으면
 *                            강원대 `미래인재` → `미래인재1`·`미래인재2` 처럼
 *                            **쪼개진** 것을 이름이 바뀐 것으로 잘못 읽는다
 *   4. 이름이 0.5 이상 닮았다  `similarity` 로 잰다
 *
 * **문턱 0.5 는 재서 잡았다.** 후보의 닮은 정도 분포에 0.48 과 0.50 사이가 비어 있다.
 * 0.50 위쪽은 `교과(일반)→교괴(일반전형)`(오타) · `종합(일반)→종합(학생부종합)` ·
 * `교과(추천)→교과(학교장추천)` 처럼 눈으로 봐도 같은 전형이고,
 * 0.40~0.48 은 `교과(지역)→교과(일반)` · `종합(지역)→종합(일반)` 처럼 섞여 있다.
 * 애매한 구간은 **잇지 않는다.**
 *
 * 이어 놓은 것이 맞는지도 쟀다. 같은 이름 한 전형 안에서 이웃한 해끼리 70%컷이
 * 움직인 폭이 31,149 쌍 기준 중앙 0.28 · 95% 1.37 이다. 이어 붙인 경계에서의
 * 컷 차이는 중앙 0.26, 1.37 을 넘는 것이 6% — **같은 전형의 다음 해와 구별되지 않는다.**
 * (컷은 확인에만 썼다. 숫자가 이어진다고 이어 붙이면 추이가 실제보다 매끈해진다.)
 *
 * @return {Map<string, {rows, keys, name, aliases, cat, lo, hi}>}
 *         rows 는 연도 오름차순, name 은 **가장 최근 해의 표기**
 */
const RENAME_SIM = 0.5;
/** 전형 이름이 이만큼 닮으면 같은 전형으로 본다. 2등과는 이만큼 벌어져야 한다. */
const SIM_TYPE = 0.65;
const SIM_GAP = 0.1;

/**
 * **이름 끝에 번호가 붙은 것은 이름이 바뀐 게 아니라 쪼개진 것이다.**
 *
 *     종합(학생부종합) → 종합(학생부종합Ⅰ)      신라대
 *     교과(일반전형)   → 교과(일반전형Ⅰ)        동양대
 *     종합(미래인재)   → 종합(미래인재1)        강원대
 *     교과(지역학생)   → 교과(지역1)           광주대
 *
 * 1:1 조건만으로는 안 걸린다. 쪼개진 가지 가운데 하나만 그 학과에서 이어지는 해에
 * 나타나면 1:1 로 보이기 때문이다. 그런데 이어 붙이면 컷이 3~5등급씩 벌어진다 —
 * 다른 전형이니 당연하다.
 *
 * 재 봤다. 이 규칙 하나로 이어 붙인 짝이 991 → 767 로 줄고, 경계에서 컷이 기준선
 * 95%(1.34등급)를 넘는 비율이 **9% → 6%** 가 된다. 같은 전형의 이웃한 해에서
 * 기대되는 5% 와 구별되지 않는 수준이다.
 *
 * 「면접·서류·교과」 꼴 표시가 다르면 막는 규칙도 재 봤는데 오히려 나빠졌다(8%).
 * 좋은 연결을 더 많이 잃는다. 그래서 **번호만** 본다.
 */
function isSplit(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!long.startsWith(short) || long === short) return false;
  return /^[0-9I]+$/.test(long.slice(short.length));
}

export function typeGroups(rows) {
  const g = new Map();
  for (const r of rows || []) {
    const k = normType(r.type) || '전형 미상';
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  }
  const keys = [...g.keys()];
  if (keys.length > 1) {
    const info = new Map(keys.map((k) => {
      const v = g.get(k);
      return [k, {
        cat: v[0].cat,
        lo: Math.min(...v.map((r) => r.year)),
        hi: Math.max(...v.map((r) => r.year)),
      }];
    }));
    // 이어질 수 있는 짝을 모은 뒤, 앞뒤로 하나씩인 것만 남긴다
    /*
     * **쪼개진 흔적이 보이면 그 전형은 아무 데도 안 잇는다.**
     *
     * 예전에는 `isSplit` 인 짝만 건너뛰었다. 그런데 건너뛰는 순간 그 전형의
     * **진짜 형제들이 후보에서 사라져서**, 남은 엉뚱한 하나가 1:1 로 보인다.
     *
     *     한서대 항공관광  교과(학생부교과) 2022
     *       → 교과(학생부교과1) 2023~  쪼개진 것 → 건너뜀
     *       → 교과(학생부교과2) 2023~  쪼개진 것 → 건너뜀
     *       → 교과(지역인재)   2023~  **혼자 남아 이어졌다**
     *
     * 그래서 두 학생 카드에 4.3(학생부교과1) 대신 5.0·경쟁률 2.59(지역인재)가
     * 붙어 있었다. 이름이 그럴듯해 아무도 못 알아챈다.
     *
     * 쪼개진 짝이 하나라도 있으면 그 이름은 잇는 후보에서 통째로 뺀다.
     */
    const pairs = [];
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        const A = info.get(a);
        const B = info.get(b);
        if (A.cat !== B.cat || A.hi + 1 !== B.lo) continue;
        if (similarity(a, b) < RENAME_SIM) continue;
        pairs.push([a, b]);
      }
    }
    const parent = new Map(keys.map((k) => [k, k]));
    const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
    /*
     * **쪼개진 짝은 세기에는 넣고 잇기만 막는다.**
     *
     * 예전에는 `isSplit` 인 짝을 후보 목록에서 아예 뺐다. 그러면 그 전형의 진짜
     * 형제가 사라져서 **남은 엉뚱한 하나가 1:1 로 보인다.**
     *
     *     한서대 항공관광  교과(학생부교과) 2022
     *       → 교과(학생부교과1)  쪼개진 것이라 목록에서 빠짐
     *       → 교과(학생부교과2)  쪼개진 것이라 목록에서 빠짐
     *       → 교과(지역인재)    **혼자 남아 이어졌다** — 두 학생 카드에
     *                          4.3 대신 5.0·경쟁률 2.59 가 붙어 있었다
     *
     * 그렇다고 쪼개진 이름을 통째로 못 잇게 막아도 안 된다. 이번엔 반대로,
     * 충남대 소비자 `종합Ⅰ` 의 후보에서 `종합Ⅰ(일반)`·`종합Ⅰ[일반(300)]`
     * 짝이 빠지는 바람에 `종합Ⅰ(서류)` 가 혼자 남아 이어졌다.
     *
     * 그래서 **후보로는 세고, 잇지만 않는다.** 형제가 몇인지는 그대로 보이고
     * 쪼개진 곳에서는 아무것도 안 이어진다.
     */
    for (const [a, b] of pairs) {
      if (pairs.filter(([x]) => x === a).length !== 1) continue;
      if (pairs.filter(([, y]) => y === b).length !== 1) continue;
      if (isSplit(a, b)) continue;
      parent.set(find(a), find(b));
    }
    for (const k of keys) {
      const root = find(k);
      if (root === k) continue;
      g.get(root).push(...g.get(k));
      g.delete(k);
    }
  }

  const out = new Map();
  for (const [k, v] of g) {
    const sorted = v.slice().sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1];
    out.set(k, {
      rows: sorted,
      keys: [...new Set(sorted.map((r) => normType(r.type) || '전형 미상'))],
      name: last.type || '전형 미상',
      aliases: [...new Set(sorted.map((r) => r.type).filter((t) => t && t !== last.type))],
      cat: last.cat,
      lo: sorted[0].year,
      hi: last.year,
    });
  }
  return out;
}

/**
 * 신설 전형에 곁들일 **관련 전형**을 고른다.
 *
 * 두 갈래다.
 *
 *   하나로 좁혀졌으면   그 전형만 (이름이 닮아 붙었던 것 — 「지역의사제」↔「지역인재」)
 *   못 좁혔으면        같은 유형의 전형을 **전부** 범위로
 *
 * 둘째가 오히려 흔하고, 흔한 게 맞다. 올해 처음 뽑는 전형이면 작년에 그것과
 * 짝지을 전형이 애초에 없는 게 정상이다. 경성대 영어영문 「교과(지역인재)」가
 * 그렇다 — 작년 교과는 「교과(일반계교과)」 4.30 과 「교과(일반계면접)」 4.70 이었다.
 * 하나를 골라 주는 것보다 둘 다 보여 주고 「이 학과 교과는 이 언저리」라고
 * 말하는 편이 정직하다.
 *
 * **유형이 다르면 아무것도 안 준다.** 논술 신설에 교과 컷을 참고랍시고 보여 주면
 * 그건 참고가 아니라 헛말이다.
 */
function nearbyOf(rows, cat, picked, reason) {
  const fits = (g) => !cat || g.rows.some((r) => r.cat === cat || String(r.type).includes(cat));
  if (picked.rows.length && fits({ rows: picked.rows })) {
    return { reason, groups: [{ name: picked.type, rows: picked.rows }], sole: true };
  }
  const groups = [...typeGroups(rows).values()].filter(fits);
  if (!groups.length) return null;
  return {
    reason,
    sole: false,
    groups: groups
      .map((g) => ({ name: g.name, rows: g.rows }))
      .sort((a, b) => {
        const av = a.rows[a.rows.length - 1].g70;
        const bv = b.rows[b.rows.length - 1].g70;
        return (av == null) - (bv == null) || (av ?? 0) - (bv ?? 0);
      }),
  };
}

/**
 * **고른 전형이 학과 자료보다 일찍 끊겼나** — 끊겼으면 그렇다고 말한다.
 * =====================================================================
 * 카드는 고른 전형의 가장 최근 줄을 「작년 경쟁률」·「작년 70% 컷」이라 적어 왔다.
 * 그런데 그 줄이 정말 작년 것이 아닐 때가 있다. 2027 모집요강의 전형·모집단위
 * 16,714 가지 가운데 입결이 붙는 12,294 가지를 다 돌려 보면 **352건(2.9%)** 에서
 * 고른 전형의 마지막 해가 그 학과 자료의 마지막 해보다 이르다. 3년 묵은 숫자가
 * 「작년」이라는 이름표를 달고 있었다.
 *
 * 끊기는 까닭은 대개 **전형이 쪼개져서**다. 352건 중 170건이 그 꼴이다.
 *
 *     가톨릭대(성심)  종합(잠재능력) ~2023  →  2024부터 잠재능력-면접 · 잠재능력-서류
 *     강원대(도계)    종합(미래인재) ~2023  →  2025까지 미래인재1 · 미래인재2
 *
 * **그래도 잇지 않는다.** 「미래인재면접」이 미래인재1인지 2인지 이름으로는 못
 * 가린다. 골라 주면 그럴듯한 숫자가 뜨고 아무도 못 알아챈다.
 * 대신 뒤를 잇는 전형이 무엇인지 적어 두고 선생님이 「연도별 추이」에서 직접
 * 견주게 한다. **오연결이 미연결보다 나쁘다.**
 *
 * 뒤를 잇는 것으로 치는 조건은 좁게 잡았다 — 같은 카테고리이고, 정규화한 이름이
 * 고른 전형의 이름을 **앞에 그대로 두고 더 붙인 것**이며, 더 나중 해까지 있는 것.
 * 이름이 아주 달라진 경우는 여기서 안 잡힌다. 그건 `nearbyOf` 의 몫이다.
 */
const MJ = /면접/;
const SR = /서류/;
const mark = (t) => {
  const m = MJ.test(t);
  const r = SR.test(t);
  return m && !r ? '면접' : (r && !m ? '서류' : null);
};

/**
 * **면접이냐 서류냐는 가릴 수 있다.** 전형단계가 말해 준다.
 * =====================================================================
 * 쪼개진 갈래가 「면접형·서류형」 둘이면 어느 쪽인지 자료로 가려진다.
 * 면접형은 1단계에서 걸러 놓고 2단계에서 면접을 보니 **단계별전형**이고,
 * 서류형은 서류만 보고 한 번에 뽑으니 **일괄전형**이다.
 *
 * 2027 모집요강의 학생부종합 가운데 이름에 면접·서류가 든 1,898줄로 재 봤다.
 *
 *              2단계    1단계
 *     면접형     843       17
 *     서류형       2    1,036
 *
 * 「2단계면 면접·1단계면 서류」로 읽으면 **99.0%(1,879/1,898)** 를 맞힌다.
 *
 * 여기에 지원한 전형의 **이름**도 같이 본다. 이름에 면접·서류가 들어 있으면
 * 그것도 한 표다. 실제로 갈릴 일이 있는 41장에서는 이름과 단계가 **41장 모두
 * 일치했고 어긋난 것이 0장**이다. 어긋나면 안 고른다.
 *
 * **`among`(전형 못 가림) 후보에는 이 규칙을 안 쓴다.** 거기 후보들은 그저
 * 「이 학과에 있는 전형」이라 끝 글자만 같은 남남이 섞인다 — 강원대(강릉) 사학과의
 * 「지역인재서류전형」을 「미래인재서류」에 이어 버린다. 아예 다른 전형이다.
 * 쪼개진 갈래는 다르다. 고른 전형의 이름을 앞에 그대로 두고 갈라져 나온 것이라
 * 남는 물음이 「면접이냐 서류냐」 하나뿐이다.
 */
const STAGE_OF = { 면접: 2, 서류: 1 };

function pickHeir(heirs, app, mojipRows) {
  const m = heirs.filter((h) => mark(h.name) === '면접');
  const r = heirs.filter((h) => mark(h.name) === '서류');
  // 면접 하나 · 서류 하나로 깨끗이 갈릴 때만. 셋 이상이거나 딴것이 섞이면 손 뗀다.
  if (m.length !== 1 || r.length !== 1 || heirs.length !== 2) return null;

  const rows = (mojipRows || []).filter((x) => x && x.stages != null);
  const byName = mark([app && app.typeSub, app && app.typeName].filter(Boolean).join(' '));

  /*
   * **전형단계는 모집요강이 한 목소리일 때만 그 자체로 쓴다.**
   * `pickMojip` 의 `byName` 은 「이름으로 맞은 줄이 있다」는 뜻이지 「하나뿐」이라는
   * 뜻이 아니다. 두루뭉술한 이름(`종합(잠재능력)`)은 면접전형(2단계)과 서류전형
   * (1단계)에 **둘 다** 걸려서, 맨 앞 줄의 단계를 집으면 동전 던지기가 된다.
   */
  const one = rows.length && rows.every((x) => x.stages === rows[0].stages)
    ? rows[0].stages : null;
  const byStage = one === 2 ? '면접' : (one === 1 ? '서류' : null);
  if (byName && byStage && byName !== byStage) return null;   // 어긋나면 안 고른다

  /*
   * 이름으로 가렸으면 **같은 표시를 단 모집요강 줄**의 단계로 뒷받침한다.
   * 모집요강이 반대로 말하면(면접형인데 일괄전형) 손 뗀다 — 1,898줄에 19줄 있는
   * 그 예외 가운데 하나일 수 있다.
   */
  let backed = false;
  if (byName) {
    const same = rows.filter((x) => mark(x.type) === byName);
    if (same.length) {
      if (!same.every((x) => x.stages === STAGE_OF[byName])) return null;
      backed = true;
    }
  }

  const want = byName || byStage;
  if (!want) return null;
  const why = byName
    ? (backed ? `${STAGE_OF[want]}단계 전형이고 이름도 ${want}형이라`
      : `전형 이름이 ${want}형이라`)
    : `${one}단계 전형이라`;
  return { ...(want === '면접' ? m[0] : r[0]), why };
}

function staleOf(rows, mineRows, app, mojipRows) {
  if (!mineRows.length) return null;
  const hi = Math.max(...mineRows.map((r) => r.year));
  const deptHi = Math.max(...rows.map((r) => r.year));
  if (hi >= deptHi) return null;
  const me = normType(mineRows[0].type);
  const cat = mineRows[0].cat;
  const heirs = [...typeGroups(rows).values()]
    .filter((G) => G.cat === cat && G.hi > hi
      && G.keys.some((k) => k !== me && me && k.startsWith(me)))
    .map((G) => {
      const cut = G.rows.filter((r) => r.g70 != null);
      const last = cut[cut.length - 1] || G.rows[G.rows.length - 1];
      return {
        name: G.name, rows: G.rows, hi: G.hi,
        year: last.year, g70: last.g70, rate: last.rate,
      };
    })
    .sort((a, b) => (a.g70 == null) - (b.g70 == null) || (a.g70 ?? 0) - (b.g70 ?? 0));
  const withCut = mineRows.filter((r) => r.g70 != null);
  const last = withCut[withCut.length - 1] || mineRows[mineRows.length - 1];
  return {
    was: mineRows[0].type,                 // 끊긴 쪽 이름 — 카드가 이것을 설명한다
    year: last ? last.year : null, hi, deptHi,
    heirs,
    heir: pickHeir(heirs, app, mojipRows),   // 갈래를 가렸으면 그 갈래
  };
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
  const groups = typeGroups(rows);
  let keys = [...groups.keys()];
  if (!keys.length) return { rows: [], fit: 'none', type: null };
  const take = (k, fit) => ({ rows: groups.get(k).rows, fit, type: groups.get(k).name });

  /*
   * **면접형에 서류형 컷을 붙이지 않는다 — 어느 갈래에서든.**
   *
   * 예전에는 이 가림이 `pickHeir`(쪼개진 전형) 에만 있었다. 그런데 충남대 소비자
   * 「종합Ⅰ[면접(300)]」이 `near` 로 「종합Ⅰ(서류)」에 붙는 일이 있었다. 같은 대학
   * 같은 학과 같은 종합인데 뽑는 방식이 아예 다르고, 컷도 3.54 대 3.74 로 갈린다.
   *
   * 이름에 「면접」만 있으면 면접형, 「서류」만 있으면 서류형이다. 둘 다 있거나
   * 둘 다 없으면 아무 말도 안 한 것이라 가리지 않는다. 어긋나는 것만 뺀다 —
   * 골라 주는 게 아니라 **아닌 것을 지우는** 규칙이다.
   */
  const myMark = mark(app.typeSub || app.typeName || '');
  let markCut = false;
  if (myMark) {
    const fits = keys.filter((k) => {
      const other = mark(groups.get(k).name);
      return !(other && other !== myMark);
    });
    markCut = fits.length !== keys.length;
    if (fits.length) keys = fits;
  }

  const want = normType(app.typeSub) || normType(app.typeName);
  if (want) {
    /*
     * 묶음 안의 **어느 해 이름과 맞아도** 맞은 것으로 본다.
     * 즐겨찾기가 작년 표기를 그대로 갖고 있는 경우가 있어서다 —
     * `교과(추천)` 으로 적혀 있는데 올해 입결은 `교과(학교장추천)` 이다.
     */
    const hitExact = keys.filter((k) => groups.get(k).keys.includes(want));
    if (hitExact.length === 1) return take(hitExact[0], 'exact');

    // 겹치는 글자가 가장 긴 묶음. 비기면 고르지 않는다.
    let best = 0;
    let hit = [];
    for (const k of keys) {
      for (const alt of groups.get(k).keys) {
        if (alt.length < 2 || !(alt.includes(want) || want.includes(alt))) continue;
        const len = Math.min(alt.length, want.length);
        if (len > best) { best = len; hit = [k]; } else if (len === best && !hit.includes(k)) hit.push(k);
      }
    }
    if (hit.length === 1) return take(hit[0], 'near');

    /*
     * **글자가 안 겹쳐도 같은 전형인 것들.**
     *
     *     고려대   교과:학교추천        ↔  교과(학교장추천)     0.80   「장」 한 글자
     *     광운대   종합광운참빛1면접형   ↔  종합(광운참빛-면접)   0.81
     *     원광대   교과지역교과호남권    ↔  교과(지역-호남)      0.77
     *     가천대   종합가천바람개비      ↔  종합(바람개비)       0.74
     *     전북대   교과지역1유형        ↔  교과(지역1호남)      0.69
     *
     * `near` 는 한쪽이 다른 쪽을 통째로 감쌀 때만 잡는다. 위의 것들은 가운데
     * 한두 글자가 다를 뿐인데 다 놓쳐서, 맞는 줄을 카테고리로 집어 놓고도
     * 카드에는 「전형을 이름으로 맞추지 못했습니다」라는 붉은 줄이 붙었다.
     * 선생님이 **맞은 것을 틀렸다고 읽게 되는** 자리다.
     *
     * 문턱 0.65 는 재서 잡았다. 실제 지원 502건에서 여기까지 내려오는 짝의
     * 닮은 정도를 늘어놓으면 0.63 과 0.69 사이가 갈림목이다.
     *
     *     0.69 이상  전북대 지역1유형·가천대 바람개비·원광대 지역호남·고려대
     *                학교추천·광운대 참빛면접 — 눈으로 봐도 같은 전형
     *     0.63 이하  명지대 `명지인재면접` ↔ `명지인재서류`(0.63) ·
     *                성균관대 `서류형기회균형` ↔ `융합형`(0.44) — 다른 전형이다
     *
     * 그래서 셋을 다 만족할 때만 고른다.
     *   1. 유형(교과/종합/논술/실기)이 같다
     *   2. 0.65 이상이 **하나뿐**이고 2등과 0.1 이상 벌어진다
     *   3. 면접·서류 표시가 어긋나지 않는다 — 이것 하나로 명지대가 걸린다
     *      (0.63 이라 이미 걸리지만, 문턱만 믿지 않는다)
     */
    const myCat = catOf(app.typeCat) || catOf(app.typeSub) || catOf(app.typeName);
    const scored = keys
      .filter((k) => !myCat || groups.get(k).rows
        .some((r) => r.cat === myCat || String(r.type).includes(myCat)))
      .map((k) => ({ k, s: Math.max(...groups.get(k).keys.map((alt) => similarity(want, alt))) }))
      .sort((a, b) => b.s - a.s);
    if (scored.length && scored[0].s >= SIM_TYPE
      && (scored.length === 1 || scored[0].s - scored[1].s >= SIM_GAP)) {
      return take(scored[0].k, 'sim');
    }
  }

  /*
   * **표시가 어긋나 지운 게 있으면 유형만으로 고르지 않는다.**
   *
   * 면접형으로 넣었는데 이 학과 입결에 서류형밖에 없다면, 그건 「이름을 못 맞췄다」가
   * 아니라 **면접형 자료가 없다**는 뜻이다. 그런데 서류형을 지우고 나면 남은 다른
   * 종합 하나가 유형만 같다는 이유로 뽑힌다 — 명지대 자율전공 「명지인재면접」이
   * 「종합(크리스천리더)」에 붙었다. 지운 자리를 옆 전형으로 메우면 안 된다.
   */
  const cat = catOf(app.typeCat) || catOf(app.typeSub) || catOf(app.typeName);
  if (cat && !markCut) {
    const hit = keys.filter((k) => groups.get(k).rows
      .some((r) => r.cat === cat || String(r.type).includes(cat)));
    if (hit.length === 1) return take(hit[0], 'cat');
  }

  /*
   * 이 학과 입결에 전형이 하나뿐이면 그것으로 본다 — **다만 유형이 같을 때만.**
   *
   * 유형까지 어긋나면 논술 지원자에게 교과 컷이, 태권도 실기 지원자에게 실기실적
   * 컷이 붙는다. 실제로 그랬다 — 동국대 바이오시스템 논술에 교과(학교장추천) 1.30,
   * 광주대 태권도 교과에 실기실적 7.38. 하나뿐이라는 것은 고를 게 없다는 뜻이지
   * 그게 맞다는 뜻이 아니다.
   *
   * 그래서 `only` 는 이제 **지원자 쪽 유형을 못 가렸을 때만** 나온다. 유형이 같으면
   * 위의 `cat` 갈래가 이미 잡기 때문이다. 재 보니 예전 `only` 38건은 전부 유형이
   * 어긋난 것이었다 — 이 갈래는 여태 위험한 경우에만 도달하고 있었다.
   */
  if (keys.length === 1 && !markCut) {
    const one = groups.get(keys[0]);
    if (!cat || one.rows.some((r) => r.cat === cat || String(r.type).includes(cat))) {
      return take(keys[0], 'only');
    }
    return { rows: [], fit: 'none', type: null, among: [one.name] };
  }

  /*
   * 못 골랐으면 **무엇들 사이에서 못 골랐는지**를 함께 돌려준다.
   * 「가려내지 못했습니다」만 적으면 선생님은 표를 처음부터 훑어야 한다.
   * 같은 유형(교과/종합)의 이름만 추리면 대개 둘이라 눈으로 바로 고를 수 있다.
   */
  const near = cat ? keys.filter((k) => groups.get(k).rows.some((r) => r.cat === cat)) : [];
  // 이름이 가장 많이 겹치는 것부터. 화면에서 잘리더라도 앞에 남는 것이 진짜 후보여야 한다.
  const overlap = (k) => (want
    ? Math.max(...groups.get(k).keys.map((alt) => (alt.includes(want) || want.includes(alt)
      ? Math.min(alt.length, want.length) : 0)))
    : 0);
  const among = (near.length ? near : keys)
    .slice()
    .sort((a, b) => overlap(b) - overlap(a))
    .map((k) => groups.get(k).name);
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
  const want0 = norm(app.typeSub) || norm(app.typeName);
  if (rows.length < 2) {
    const out = rows.slice();
    const t = rows[0] ? norm(rows[0].type) : '';
    out.byName = Boolean(want0 && t && (t === want0 || t.includes(want0) || want0.includes(t)));
    return out;
  }
  const want = norm(app.typeSub) || norm(app.typeName);
  const cat = catOf(app.typeCat);
  const score = (r) => {
    const t = norm(r.type);
    if (want && t && (t === want || t.includes(want) || want.includes(t))) return 0;
    if (cat && r.type && String(r.type).includes(cat)) return 1;
    return 2;
  };
  const sorted = rows.map((r, i) => [score(r), i, r])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = sorted.map((x) => x[2]);
  // 맨 앞 줄이 **이름으로** 맞은 것인지 표시해 둔다.
  // 「올해 신설」은 이 줄의 작년 모집인원을 보고 말하는데, 이름도 못 맞춘 줄로
  // 그런 말을 하면 옆 전형이 작년에 없었다는 이야기가 된다.
  out.byName = sorted.length > 0 && sorted[0][0] === 0;
  return out;
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

/**
 * **올해 신설인가.**
 *
 * 「입결에 없다」로 짐작하면 안 된다. 모집요강 줄의 23.8% 가 입결에 그 전형 이름이
 * 없는데, 그건 대개 이름이 달라진 것이지 신설이 아니다(`가천대 종합(가천바람개비)` ↔
 * 입결 `종합(바람개비)`). 짐작으로 「신설」이라 적으면 넷 중 하나꼴로 거짓말이 된다.
 *
 * **모집요강이 직접 말해 준다.** 작년 모집인원과 작년 경쟁률이 둘 다 비어 있으면
 * 올해 처음 뽑는 것이다. 전체의 12.2% 다. 다만 그 줄이 **지원한 전형의 줄일 때만**
 * 그렇게 말한다 — 이름도 못 맞춘 줄로 신설을 말하면 옆 전형 이야기를 하는 셈이다.
 */
/*
 * **「작년에 안 뽑았다」와 「올해 새로 만들었다」는 다른 말이다.**
 *
 * 모집요강은 작년(2026)까지만 안다. 그래서 작년 모집인원·경쟁률이 비었다는 것은
 * 「작년에 이 전형이 없었다」까지만 말해 준다. 그 앞도 없었는지는 **입결이 안다.**
 *
 * 단국대(죽전) 정치외교 「학생부교과(지역균형선발)」이 그랬다. 2022~2025 내내
 * 「교과(지역균형)」으로 뽑다가 2026 한 해를 건너뛰고 올해 다시 뽑는다. 모집요강만
 * 보고 「올해 신설」이라 적었더니 네 해치 컷을 갖고도 카드가 텅 비었고, 화면에는
 * 「신설이라 작년 값이 없습니다」와 「내가 넣은 전형(2022~2025)」이 나란히 떴다.
 *
 * 그래서 **입결에 같은 이름이 이미 있으면 신설이 아니다.** 이름이 같다(`exact`)는
 * 조건은 일부러 좁게 뒀다 — 건국대(글로컬) 「지역의사제(광역권)」은 정말 신설인데
 * 이름이 닮은 「교과(지역인재)」에 `near` 로 붙는다. 닮은 것까지 신설이 아니라고
 * 하면 그 572건이 도로 남의 컷을 달게 된다.
 */
function isNewThisYear(mojipRows, picked) {
  if (!mojipRows || !mojipRows.length || !mojipRows.byName) return false;
  const r = mojipRows[0];
  if (!(r.quotaPrev == null && r.rate26 == null)) return false;
  // 입결에 같은 이름의 전형이 이미 있으면 신설이 아니라 **작년 한 해를 쉰 것**이다
  if (picked && picked.fit === 'exact' && picked.rows && picked.rows.length) return false;
  return true;
}

export function summarize(l, app) {
  if (!l) return { linked: false, kind: 'univ', rows: [], before: null, real: NO_RATE, why: '자료를 받는 중입니다' };
  if (l.confidence === 'none') {
    /*
     * 입결은 못 붙었어도 **모집요강은 붙었을 수 있다.** 신설학과가 늘 그렇다.
     * `linked:false` 로 두어 컷은 안 내되, 모집요강이 주는 것(수능최저·지원자격·
     * 모집인원·전형단계·대학별고사)은 그대로 쓴다. 둘은 독립된 사실이다.
     */
    const mo = (l.mojip && l.mojip[0]) || null;
    return {
      linked: false, kind: l.kind, rows: [], mine: [], before: null, why: l.why,
      isNew: isNewThisYear(l.mojip, null), alias: l.alias || null, nearby: null, catMissing: null,
      mojip: mo,
      quotaNow: app && app.quota != null ? app.quota : (mo ? mo.quota : null),
      quotaPrev: mo ? mo.quotaPrev : null,
      real: mo ? realRate(mo.rate26, mo.quotaPrev, mo.filled26) : NO_RATE,
      stages: mo ? mo.stages : null,
    };
  }

  if (l.kind === 'college') {
    const d = l.college[0];
    return {
      linked: true, kind: 'college', why: l.why, rows: l.college, before: null, real: NO_RATE,
      alias: l.alias || null, isNew: false,
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
  const isNew = isNewThisYear(l.mojip, picked);

  /*
   * **올해 신설이면 붙은 줄은 이 전형의 작년이 아니다.**
   *
   * 건국대(글로컬) 의예과 「지역의사제(광역권)」는 올해 처음 뽑는데, 이름이 닮아
   * 「교과(지역인재)」에 붙어 그 컷 1.35 를 이 전형의 작년 값인 양 달고 나왔다.
   * 신설 전형 2,205건 가운데 572건이 그랬다.
   *
   * 작년에 없던 전형이니 작년 컷도 없는 게 맞다. 다만 옆 전형이 아무 말도 안 해 주는
   * 것은 아니다 — 같은 대학 같은 학과의 **유형이 같은 전형**이면 대략의 선은 된다.
   * 자유전공의 「묶이기 전 학과 참고」와 같은 자리에 같은 꼴로 둔다.
   *
   * 유형까지 다르면 참고로도 안 준다. 논술 신설에 교과 컷을 참고랍시고 보여 주면
   * 그건 참고가 아니라 헛말이다.
   */
  const want = catOf(app && app.typeCat) || catOf(app && app.typeSub) || catOf(app && app.typeName);

  /*
   * **머리 숫자를 못 채우는 경우가 셋인데, 서로 다른 말이다.**
   *
   *   신설          작년에 없던 전형이다 → 같은 유형을 곁들인다
   *   못 가림        전형이 여럿이라 어느 줄인지 모른다 → 같은 유형을 범위로 곁들인다
   *   유형이 없음    이 학과 입결에 그 유형이 아예 없다 → 곁들일 것도 없다
   *
   * 셋을 「전형 못 가림」 하나로 뭉치면, 논술 지원자가 「자료 정리가 덜 됐나 보다」로
   * 읽는다. 실제로는 **논술 입결을 공개하는 대학이 적어서** 없는 것이다 —
   * 입결 75,200행 가운데 논술은 966행뿐이고 그중 70%컷이 있는 것은 46% 다.
   */
  const catMissing = want
    && !rows.some((r) => r.cat === want || String(r.type).includes(want))
    ? want : null;
  const blank = isNew || picked.fit === 'none';
  const nearby = blank && !catMissing
    ? nearbyOf(rows, want, picked, isNew ? 'new' : 'unsure')
    : null;

  const mo = l.mojip[0] || null;
  let mineRows = nearby ? [] : picked.rows;

  /*
   * **쪼개진 갈래를 가렸으면 그 갈래의 줄을 쓴다.**
   * 가리지 못했으면 끊긴 쪽 줄을 그대로 두고, 카드가 「2023년까지만 있습니다」라고
   * 적는다. 가린 근거도 화면에 적는다 — 숨기면 그냥 오연결이다.
   */
  const stale = staleOf(rows, mineRows, app, l.mojip);
  if (stale && stale.heir) mineRows = stale.heir.rows;

  /*
   * **가장 최근 해에 컷이 없으면 그 앞 해를 본다.**
   *
   * 예전에는 그냥 마지막 줄을 썼다. 그런데 2026 줄은 있는데 70%컷 칸만 비어 있는
   * 경우가 흔하다 — 대학이 그해 것을 아직 안 냈거나 안 내기로 한 것이다. 그러면
   * 2022~2025 네 해치 컷을 갖고도 카드가 통째로 빈칸이 됐다. 강원대 교육학과
   * 교과(지역교과)가 그랬다. 이런 줄이 521건이다.
   *
   * 컷이 있는 가장 최근 줄을 **통째로** 쓴다. 칸마다 다른 해에서 긁어모으면
   * 경쟁률은 2026, 컷은 2025 인 카드가 되고 그건 어느 해 이야기도 아니다.
   * 대신 어느 해 것인지 화면에 적는다 — 카드 제목이 「작년 25입결」이 된다.
   */
  const withCut = mineRows.filter((r) => r.g70 != null);
  const latest = withCut[withCut.length - 1] || mineRows[mineRows.length - 1] || null;
  // 줄은 붙었는데 어느 해에도 컷이 없는 경우. 「연결 실패」와는 다른 말이다.
  const cutMissing = mineRows.length > 0 && withCut.length === 0;
  return {
    linked: rows.length > 0, kind: 'univ', why: l.why, rows,
    mine: mineRows,                    // 지원한 전형의 줄만 (신설이면 빈다)
    nearby,                            // 곁들이는 관련 전형 {reason, sole, groups}
    catMissing,                        // 이 학과 입결에 그 유형이 아예 없으면 그 유형 이름
    cutMissing,                        // 전형은 붙었는데 어느 해에도 70%컷이 없으면 true
    isNew,                             // 올해 처음 뽑는 전형인가 (모집요강이 말한다)
    alias: l.alias || null,            // 선생님이 손으로 이어 둔 학과가 있으면 그것
    // 숫자가 어느 전형에서 왔는지. 갈래를 가렸으면 그 갈래 이름이다.
    type: stale && stale.heir ? stale.heir.name : picked.type,
    typeFit: stale && stale.heir ? 'heir' : picked.fit,   // exact|near|cat|only|heir|none
    among: picked.among || null,       // 못 골랐을 때 후보로 남은 전형 이름들
    stale,                             // 고른 전형이 학과 자료보다 일찍 끊겼으면 {year, deptHi, heirs}
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

/**
 * 이름이 바뀐 앞선 학과를 찾는다 — **잇지는 않는다.**
 * =====================================================================
 * 학과는 자주 바뀐다. (대학·학과) 8,502 곳 가운데 30.4% 가 2026 에 없고 23.6% 가
 * 2022 에 없다. 대학이 학부를 쪼개고 합치고 이름을 갈아 대기 때문이다.
 *
 * 그래서 올해 원서를 쓰는 학과가 입결에는 한두 해치밖에 없는 일이 흔하다 —
 * 모집요강 학과의 833 곳이 그렇다. 그중 145 곳은 **바로 앞 해에 끝난 이름 닮은
 * 학과**가 1:1 로 있다. 강원대 「일본학과」(2026) 앞에 「일본어학과」(~2025) 가 있는 식이다.
 *
 * **그런데 자동으로 이으면 안 된다.** 재 봤다 — 같은 학과 안에서 이웃한 해의 70%컷이
 * 움직인 폭이 19,345쌍 기준 중앙 0.25 · 95% 1.13 인데, 이렇게 이어 붙인 경계에서
 * 1.13 을 넘는 비율이 **14%** 다. 기대치 5% 의 세 배다. 문턱을 0.8 까지 올려도
 * 오히려 나빠진다(17%).
 *
 * 전형 이름과는 다른 이야기다. 전형은 이름만 갈리는 일이 많지만, 학과는 이름이
 * 바뀔 때 **가르치는 것과 뽑는 수도 같이 바뀐다.** 「수의예과 → 수의학과」는 같은
 * 곳이지만 「기계공학과 → 기계융합공학부」는 다른 곳일 수 있고, 자료만 보고는 못 가린다.
 *
 * 그래서 찾아서 **보여 주기만 한다.** 이을지는 선생님이 정한다 — 점검 화면에서
 * 여러 학과를 골라 참고선으로 잇는 길이 이미 있다.
 *
 * @return {?{dept, years, n, score}}  1:1 로 걸리는 앞선 학과. 없으면 null
 */
export function predecessor(app, src, linked) {
  if (!src || !src.ipgyeol || !linked || !linked.ipgyeol || !linked.ipgyeol.length) return null;
  const years = [...new Set(linked.ipgyeol.map((r) => r.year))].sort();
  if (years.length > 2) return null;          // 연차가 넉넉하면 볼 것 없다
  const lo = years[0];
  const univ = linked.ipgyeol[0].univ;
  const want = normDept(app.dept);

  // 이 대학의 학과를 연차와 함께 모은다
  const all = [];
  for (const [k, rows] of src.ipgyeol.byKey) {
    if (!k.startsWith(`${univ}|`) || !rows.length || rows[0].univ !== univ) continue;
    const ys = [...new Set(rows.map((r) => r.year))].sort();
    all.push({ dept: rows[0].dept, key: k, lo: ys[0], hi: ys[ys.length - 1], years: ys, n: rows.length });
  }
  const near = (a, b) => similarity(normDept(a), normDept(b));

  const hits = all.filter((v) => v.hi === lo - 1 && near(v.dept, app.dept) >= 0.5);
  if (hits.length !== 1) return null;         // 여럿이면 쪼개졌거나 합쳐진 것이다
  const cand = hits[0];
  // 그 앞선 학과가 올해 생긴 다른 학과에도 걸리면 쪼개진 것이다 — 잇지 않는다
  const rivals = all.filter((v) => v.lo === lo && near(cand.dept, v.dept) >= 0.5);
  if (rivals.length !== 1) return null;

  return { dept: cand.dept, years: cand.years, n: cand.n, score: near(cand.dept, app.dept) };
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
/**
 * 이 지원의 대학을 자료에서 찾고, 그 대학의 학과를 **전부** 모은다.
 *
 * `candidates` 와 `deptsOf` 가 같은 것을 두 번 세지 않게 여기 한 곳에 둔다.
 * 못 찾으면 `{ univ: null, list: [] }`.
 */
function deptBank(app, src) {
  const college = univKind(app.univType) === '전문대';
  let bank = college ? src.college : src.ipgyeol;
  if (!bank) return { univ: null, list: [], kind: college ? 'college' : 'univ' };

  let univ = resolveUniv(app.univ, bank.index);
  // 학교유형을 못 알아봤으면 다른 쪽 자료도 본다 (link 와 같은 규칙)
  if (!univ && !college && !app.univType && src.college) {
    bank = src.college;
    univ = resolveUniv(app.univ, bank.index);
  }
  if (!univ) return { univ: null, list: [], kind: college ? 'college' : 'univ' };

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
  const kind = college || bank === src.college ? 'college' : 'univ';
  const list = [...seen].map(([dept, years]) => ({
    dept, years: [...years].sort(), kind,
    score: similarity(app.dept, dept),
  }));
  return { univ, list, kind };
}

export function candidates(app, src, n = 6) {
  const { list } = deptBank(app, src);
  // 문턱을 낮게 둔다. 「화학공학과」와 「화공생명공학과」는 글자가 거의 안 겹치지만
  // 같은 학과일 수 있다. 후보를 감추느니 점수를 함께 보여 주고 사람이 고르게 한다.
  return list.filter((c) => c.score >= 0.15)
    .sort((a, b) => b.score - a.score || a.dept.localeCompare(b.dept, 'ko'))
    .slice(0, n);
}

/**
 * **이 대학의 학과 전부.** 닮은 이름이 하나도 없을 때 쓴다.
 *
 * 문턱(0.15)을 못 넘으면 화면이 「닮은 이름을 찾지 못했습니다」만 띄우고 빈
 * 글상자를 내밀었다. 선생님은 자료에 어떤 이름이 있는지 모르는 채로 타자를 쳐야
 * 했고, 「루마」라고 쳐 봐야 아무 일도 안 일어난다. 이을 수가 없다.
 *
 * 글자가 안 닮았다고 학과가 없는 것은 아니다 — 「글로벌비즈니스대학」의 작년
 * 자리가 「경영학부」인 식이다. **목록을 보여 주고 사람이 고르게 한다.**
 * 가나다순으로 준다. 닮은 것부터 주면 위쪽이 다 헛것이라 훑기가 더 어렵다.
 */
export function deptsOf(app, src) {
  return deptBank(app, src).list
    .sort((a, b) => a.dept.localeCompare(b.dept, 'ko'));
}

/**
 * 대학 이름이 안 닮은 것들 가운데 가까운 것.
 *
 * 대학 자체를 못 찾았으면 학과를 아무리 보여 줘도 소용없다. **먼저 대학부터**
 * 맞아야 한다 — 「국립순천대」와 「순천대학교」처럼 표기가 다른 경우다.
 */
export function similarUnivs(app, src, n = 6) {
  const college = univKind(app.univType) === '전문대';
  const banks = [college ? src.college : src.ipgyeol, src.college, src.ipgyeol];
  const seen = new Set();
  const out = [];
  for (const bank of banks) {
    if (!bank || !bank.index) continue;
    for (const name of bank.index.keys()) {
      if (seen.has(name)) continue;
      seen.add(name);
      const score = similarity(univStem(app.univ), univStem(name));
      if (score >= 0.4) out.push({ univ: name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.univ.localeCompare(b.univ, 'ko'))
    .slice(0, n);
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
/**
 * 등급 칸 하나를 읽는다. **범위 밖이면 없는 것으로 친다.**
 *
 * 원본에 70%컷이 `0` 으로 적힌 줄이 9개 있다(국립순천대 사범대 몇 곳). 등급에 0 은
 * 없다 — 값을 못 구했다는 뜻으로 0 을 넣은 것이다. 그대로 두면 화면에 `0.00` 으로
 * 찍히고, 그건 **만점처럼 읽힌다.** 빈칸이 훨씬 낫다.
 *
 * 9등급제라 상한은 9. 반올림 표기를 감안해 9.5 까지만 받는다.
 */
function grade(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 9.5 ? n : null;
}

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
      g50: grade(r[c['등급50']]), g70: grade(r[c['등급70']]), applied: r[c['지원']],
      region: r[c['지역']],
    };
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }
  for (const rows of byKey.values()) dropCatTwins(rows);
  return { index: buildUnivIndex(names), byKey, univNames: [...names] };
}

/**
 * **카테고리만 다른 쌍둥이 행을 지운다.**
 *
 * 원본에 값이 전부 같은데 카테고리 칸만 다른 행이 짝을 지어 들어 있다 —
 * 꽃동네대 간호 2026 「종합(가톨릭지도자)」이 `종합` 으로도 `교과` 로도 한 줄씩.
 * 75,494행 중 36쌍이다.
 *
 * 숫자가 같으니 어느 쪽을 골라도 화면 값은 같다. 문제는 **연결**이다.
 * `pickIpgyeol` 의 카테고리 경로가 그 묶음을 교과로도 종합으로도 인정해 버려서,
 * 교과로 지원한 학생에게 종합 전형의 줄이 붙는다. 값이 같아 아무도 못 알아챈다.
 *
 * 전형 이름이 진실을 말한다 — 「종합(…)」이면 종합이고 「교과(…)」면 교과다.
 * 이름이 말해 주지 않으면 손대지 않는다(먼저 온 줄을 남긴다).
 */
const CAT_PREFIX = [[/^논술/, '논술'], [/^실기|^실적|^특기/, '실기'],
  [/^교과|^학생부교과/, '교과'], [/^종합|^학생부종합/, '종합']];

function catFromName(type) {
  const t = String(type || '').trim();
  for (const [re, cat] of CAT_PREFIX) if (re.test(t)) return cat;
  return null;
}

function dropCatTwins(rows) {
  const seen = new Map();
  const drop = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    /*
     * **학과 원문 이름을 서명에 넣어야 한다.** 안 넣으면 `normDept` 가 한 키로 합쳐
     * 놓은 서로 다른 학과까지 쌍둥이로 본다 — 전남대 `국제학부(일본학전공)` 과
     * `국제학부(중국학전공)` 은 둘 다 키가 `국제` 다. 그걸 지우면 없는 학과가 된다.
     * 공백만 지운다. 이화여대 `스크랜튼학부 자유전공` 과 `스크랜튼학부자유전공` 은
     * 같은 학과를 두 번 적은 것이라 한 줄로 줄여야 한다.
     */
    const sig = [String(r.dept || '').replace(/\s/g, ''),
      r.year, r.type, r.quota, r.rate, r.g50, r.g70, r.applied].join('\u0001');
    if (!seen.has(sig)) { seen.set(sig, i); continue; }
    const j = seen.get(sig);
    if (rows[j].cat === r.cat) { drop.add(i); continue; }   // 완전한 중복
    const truth = catFromName(r.type);
    if (!truth) { drop.add(i); continue; }                  // 못 가리면 먼저 것을 남긴다
    drop.add(rows[j].cat === truth ? i : j);
    if (rows[j].cat !== truth) seen.set(sig, i);
  }
  if (!drop.size) return;
  const kept = rows.filter((_, i) => !drop.has(i));
  rows.length = 0;
  rows.push(...kept);
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
