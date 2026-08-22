# -*- coding: utf-8 -*-
"""HWPX의 표를 (행,열) 격자로 복원한다. cellAddr/cellSpan 을 써야 병합셀이 안 어긋난다."""
import zipfile
from xml.etree import ElementTree as ET
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def load(path):
    z=zipfile.ZipFile(path)
    return ET.fromstring(z.read('Contents/section0.xml').decode('utf-8'))

def celltext(tc):
    outs=[]
    for p in tc.iter(P+'p'):
        t=''.join(x.text or '' for x in p.iter(P+'t'))
        if t.strip(): outs.append(t.strip())
    return ' '.join(outs)

def grid(tbl):
    cells=[]
    maxr=maxc=0
    for tc in tbl.findall('.//'+P+'tc'):
        a=tc.find(P+'cellAddr'); s=tc.find(P+'cellSpan')
        r,c=int(a.get('rowAddr')),int(a.get('colAddr'))
        rs,cs=int(s.get('rowSpan')),int(s.get('colSpan'))
        cells.append((r,c,rs,cs,celltext(tc)))
        maxr=max(maxr,r+rs); maxc=max(maxc,c+cs)
    g=[['']*maxc for _ in range(maxr)]
    for r,c,rs,cs,t in cells:
        for i in range(r,r+rs):
            for j in range(c,c+cs):
                if g[i][j]=='': g[i][j]=t
    return g

def walk(root):
    """(종류, 값) 스트림. 종류: 'p' 문단, 'tbl' 표격자"""
    def rec(node, intbl):
        for ch in node:
            if ch.tag==P+'tbl':
                yield ('tbl',grid(ch)); continue
            if ch.tag==P+'p' and not intbl:
                t=''.join(x.text or '' for x in ch.iter(P+'t')).strip()
                # 표 안 문단은 제외되도록 tbl 을 먼저 처리
                if t and not any(d.tag==P+'tbl' for d in ch.iter()): yield ('p',t)
            yield from rec(ch,intbl)
    yield from rec(root,False)
