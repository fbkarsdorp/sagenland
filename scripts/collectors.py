import sqlite3,json,collections,math,statistics as st
c=sqlite3.connect('data/spooky.sqlite')
J=json.load(open('data/omeka_all_records.json'))
date={r['id']:(r.get('date_start') or [None])[0] for r in J}
rows=c.execute("select id,collector,teller,year,lat,lon,sinsag,subgenre,language from stories").fetchall()
by=collections.defaultdict(list)
for r in rows:
    if r[1]: by[r[1]].append(r)
out=[]
for col,rs in by.items():
    if len(rs)<250: continue
    sage=[r for r in rs if 'sage' in (r[7] or '')]
    tel=collections.Counter(r[2] for r in rs if r[2])
    days=collections.Counter(date[r[0]][:10] for r in rs if date.get(r[0]))
    tdays=collections.defaultdict(set)
    for r in rs:
        if r[2] and date.get(r[0]): tdays[r[2]].add(date[r[0]][:10])
    visits=sum(len(v) for v in tdays.values())
    pts=[(r[4],r[5]) for r in rs if r[4]]
    places=len(set((round(a,2),round(b,2)) for a,b in pts))
    if pts:
        ma=st.mean(a for a,b in pts); mb=st.mean(b for a,b in pts)
        rad=st.median(math.hypot((a-ma)*111,(b-mb)*70) for a,b in pts)
    else: rad=None
    tv=sorted(tel.values(),reverse=True); tot=sum(tv) or 1
    yrs=[r[3] for r in rs if r[3]]
    gen=collections.Counter(json.loads(r[7] or '[]')[0] if json.loads(r[7] or '[]') else '-' for r in rs)
    typed=sum(1 for r in rs if r[6] and r[6]!='[]')
    out.append(dict(col=col,n=len(rs),sage=len(sage),tellers=len(tel),
      years=(min(yrs) if yrs else None, max(yrs) if yrs else None),
      days=len(days), per_day=round(len(rs)/max(1,len(days)),1),
      top1=round(tv[0]/tot,2) if tv else None, top5=round(sum(tv[:5])/tot,2) if tv else None,
      med_per_teller=st.median(tv) if tv else None, visits_per_teller=round(visits/max(1,len(tdays)),2),
      per_visit=round(sum(tv)/max(1,visits),1), places=places, radius_km=round(rad,1) if rad else None,
      typed=round(typed/len(rs),2), genres=dict(gen.most_common(3)), lang=collections.Counter(r[8] for r in rs).most_common(1)[0][0]))
out.sort(key=lambda d:-d['n'])
for d in out[:45]: print(d)
json.dump(out,open('scripts/collectors_profile.json','w'),ensure_ascii=False,indent=1)
