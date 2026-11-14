import json, os
A=True
def T(text, vis=None, sp="teacher", **kw):
    vis = vis if vis is not None else kw.pop("vis")
    return dict(role=kw.pop("role","mechanism"), speaker=sp, text=text, visual=vis, **kw)
def S(text, vis, **kw): return T(text, vis, "student", **kw)
cls=lambda board, focus="teacher", tpose="point", spose="idle", **k: dict(type="class", board=board, focus=focus, tpose=tpose, spose=spose, **k)
DISC=dict(role="disclaimer", speaker="teacher", text="情報提供目的です。/投資判断は/ご自身で。", visual=dict(type="disclaimer3d"))
common=dict(asof="2026年11月時点", pr=False, renderer="3d", theme="school", series="学校で教えてほしいシリーズ",
            voice=dict(cps=5.0, tail=1.0), max_scene=5.3)
RATES=[5,10,20,23,33,40,45]
ep1=[
 S("給料から/引かれてる/これ、/なに？", dict(type="payslip3d", rows=[dict(label="給与",value="＋"),dict(label="所得税",value="−",hl=True),dict(label="住民税",value="−"),dict(label="社会保険料",value="−")]), role="hook", tail=0.45, cps=7.0),
 T("それが/所得税です。", cls(["所得税"]), role="premise"),
 T("所得税は、/所得に/かかる税金です。", cls(["所得税","＝ 所得 にかかる税金"]), role="premise"),
 T("所得とは、/収入から/経費を/引いた額です。", dict(type="income_blocks", parts=[dict(label="経費",kind="expense")], total="収入", rest="所得")),
 T("会社員の経費は、/決まった額を/引けます。", cls(["会社員の経費","＝ 決まった額でOK"], spose="think")),
 T("これを/給与所得控除と/いいます。", cls(["給与所得控除","＝ 会社員の経費"])),
 T("年収300万円なら/98万円です。", dict(type="income_blocks", total="年収300万円", total_v=300, parts=[dict(label="給与所得控除 98万円",v=98,kind="expense")], upto=1), asof=A, note="※令和8年分。300万円×30%＋8万円", calc=dict(expr="300*0.3+8",expect=98)),
 T("さらに/基礎控除/104万円も/引けます。", dict(type="income_blocks", total="年収300万円", total_v=300, parts=[dict(label="給与所得控除 98万円",v=98,kind="expense"),dict(label="基礎控除 104万円",v=104,kind="deduct")], upto=2), asof=A, note="※合計所得489万円以下の場合（令和8・9年分）"),
 T("社会保険料も/引けます。", dict(type="income_blocks", total="年収300万円", total_v=300, parts=[dict(label="給与所得控除 98万円",v=98,kind="expense"),dict(label="基礎控除 104万円",v=104,kind="deduct"),dict(label="社会保険料 45万円",v=45,kind="social")], upto=3), asof=A, note="※社会保険料は45万円と仮定"),
 T("300−98−104−45＝/53万円です。", dict(type="income_blocks", total="年収300万円", total_v=300, parts=[dict(label="給与所得控除 98万円",v=98,kind="expense"),dict(label="基礎控除 104万円",v=104,kind="deduct"),dict(label="社会保険料 45万円",v=45,kind="social")], upto=3, rest="課税所得 53万円"), asof=A, calc=dict(expr="300-98-104-45",expect=53)),
 T("この53万円が/税金をかける/もとです。", cls(["課税所得 53万円","← ここに税率をかける"]), asof=A),
 T("税率は/5%から/45%の/7段階です。", dict(type="rate_stairs", rates=RATES, highlight="sweep"), asof=A, note="※課税所得195万円以下は5%、4000万円超は45%"),
 S("えっ、/45%も/とられるの？", cls(["45%！？"], focus="student", spose="surprise", tpose="idle"), asof=A),
 T("高い税率は/超えた部分/だけです。", dict(type="progressive", total=500, brackets=[dict(upto=195,rate=5),dict(upto=330,rate=10),dict(upto=500,rate=20)]), asof=A, note="※課税所得500万円の例。195万円までは5%のまま"),
 T("これを/超過累進税率と/いいます。", cls(["超過累進税率","＝ 超えた部分だけ高い税率"])),
 T("53万円は/5%の段です。", dict(type="rate_stairs", rates=RATES, highlight=0, result="53万円 ≦ 195万円 → 5%"), asof=A),
 T("所得税は/約2.7万円です。", dict(type="result_coins", value="約2.7万円", sub="53万円 × 5% × 1.021"), asof=A, note="※復興特別所得税2.1%込み。社会保険料45万円と仮定", calc=dict(expr="530000*0.05*1.021",expect=27056,tol=1), role="example"),
 S("思ったより/少ない！", cls(["約2.7万円"], focus="student", spose="cheer", tpose="ok"), asof=A, role="example"),
 T("収入−経費−控除に/税率を/かけます。", dict(type="summary3d", text="所得税 ＝\n（収入 − 経費 − 控除）\n× 税率"), role="summary"),
 T("次回は/源泉徴収の/理由です。", cls(["次回","源泉徴収のなぜ？"], tpose="wave"), role="summary"),
 DISC,
]
ep2=[
 S("所得税って/いつ/払ったの？", cls(["所得税、いつ払った？"], focus="student", spose="think", tpose="idle"), role="hook", tail=0.45, cps=7.0),
 T("実は/毎月の給料から/もう払っています。", role="premise", vis=dict(type="payslip3d", rows=[dict(label="給与",value="＋"),dict(label="所得税",value="−",hl=True),dict(label="住民税",value="−"),dict(label="社会保険料",value="−")])),
 T("これが/源泉徴収です。", cls(["源泉徴収"]), role="premise"),
 T("会社が/給料から/先に引きます。", dict(type="flow3d", stage=1)),
 T("それを/会社が/国に納めます。", dict(type="flow3d", stage=2), asof=A, note="※原則、給料を払った月の翌月10日まで"),
 S("なんで/会社が/やるの？", cls(["なんで会社が？"], focus="student", spose="think", tpose="idle")),
 T("理由は/大きく/3つです。", dict(type="reasons3", current=None), asof=A),
 T("①納める手間を/減らすためです。", dict(type="reasons3", current=0), asof=A),
 T("全員が/自分で/計算するのは/大変です。", dict(type="crowd"), role="example"),
 T("②払い忘れを/防ぐためです。", dict(type="reasons3", current=1), asof=A),
 T("先に引けば、/取りこぼしが/ありません。", dict(type="safe3d"), role="example"),
 T("③所得を/正しく/つかむためです。", dict(type="reasons3", current=2), asof=A),
 T("日本では/1940年に/始まりました。", dict(type="plaque", title="1940年", sub="給与の源泉徴収がスタート"), asof=A, note="※昭和15年の税制改正（国税庁 税務大学校の資料）"),
 S("でも、/毎月の額って/正確なの？", cls(["毎月の額は正確？"], focus="student", spose="think", tpose="idle")),
 T("実は、/毎月の額は/見込みです。", dict(type="adjust", mode="estimate")),
 T("生命保険料などは/年末に/反映します。", cls(["生命保険料控除 など","→ 年末にまとめて"])),
 T("そのズレを/直すのが/年末調整です。", dict(type="adjust", mode="refund")),
 T("源泉徴収は/先払いの/仕組みです。", dict(type="summary3d", text="源泉徴収 ＝\n会社が給料から先に引いて\n国に納める仕組み"), role="summary"),
 T("次回は/年末調整です。", cls(["次回","年末調整ってなに？"], tpose="wave"), role="summary"),
 DISC,
]
ep3=[
 S("12月の給料、/ちょっと/多くない？", dict(type="payslip3d", title="12月の給与明細", rows=[dict(label="給与",value="＋"),dict(label="年末調整 還付",value="＋",hl=True,color="up"),dict(label="社会保険料",value="−")]), asof=A, role="hook", tail=0.45, cps=7.0),
 T("それは/年末調整の/還付かもしれません。", cls(["還付？"]), role="premise"),
 T("還付とは、/払いすぎた税金が/戻ることです。", dict(type="adjust", mode="refund"), role="premise"),
 T("年末調整とは、/1年分の税金の/答え合わせです。", dict(type="answer_sheet", title="1年分の税金", mark="○"), asof=A),
 T("毎月の源泉徴収は/見込みの額でした。", dict(type="adjust", mode="estimate")),
 T("12月に/会社が/正しい額を/計算します。", dict(type="calendar_month", month=12, label="12月に答え合わせ"), asof=A, note="※通常はその年の最後の給料のとき"),
 T("多く引いていたら/戻ってきます。", dict(type="adjust", mode="refund"), role="example"),
 T("足りなければ/追加で/引かれます。", dict(type="adjust", mode="extra"), role="example"),
 S("何を/すれば/いいの？", cls(["何をすればいい？"], focus="student", spose="think", tpose="idle")),
 T("会社から/届く書類を/出すだけです。", dict(type="documents3d", docs=["扶養控除等申告書","基礎控除申告書など","保険料控除申告書"])),
 T("生命保険料などの/証明書も/添えます。", dict(type="documents3d", docs=["保険料控除申告書","生命保険料の控除証明書"], hl=1)),
 T("出さないと/年末調整で/控除されません。", cls(["出し忘れ注意！"], tpose="worry"), note="※出し忘れても確定申告で受けられる場合があります"),
 T("2026年は/特に大事です。", cls(["2026年は特に大事！"]), asof=A),
 T("所得税の壁が/178万円に/上がりました。", dict(type="wall3d", from_label="160万円", value="178万円"), asof=A, note="※令和8年分。令和8年12月1日施行"),
 T("その分は/今年の/年末調整で/反映されます。", dict(type="adjust", mode="refund"), asof=A, note="※1年分をまとめて精算"),
 S("全部/会社が/やってくれるの？", cls(["全部会社がやるの？"], focus="student", spose="think", tpose="idle")),
 T("住宅ローン控除の1年目は/確定申告です。", dict(type="house_doc"), asof=A, note="※2年目以降は年末調整で受けられます"),
 T("確定申告とは、/自分で/税金を/申告することです。", dict(type="document_stamp", title="確定申告書", stamp="申告", caption="自分で計算して<span class=\"val\">税務署へ</span>")),
 T("年末調整は/1年分の/答え合わせです。", dict(type="summary3d", text="年末調整 ＝\n1年分の答え合わせ\n多ければ戻る\n足りなければ引かれる"), asof=A, role="summary"),
 T("書類は/早めに/出しましょう。", cls(["シリーズ おわり","また見てね！"], tpose="wave", spose="cheer"), role="summary"),
 DISC,
]
eps=[("gakko-1-shotokuzei","第1回 所得税とは",ep1),("gakko-2-gensen","第2回 源泉徴収の理由",ep2),("gakko-3-nenmatsu","第3回 年末調整とは",ep3)]
for d,title,sc in eps:
    os.makedirs(f"/home/user/-/out/{d}",exist_ok=True)
    spec=dict(title=f"学校で教えてほしいシリーズ {title}", episode=title, **common, scenes=sc)
    json.dump(spec,open(f"/home/user/-/out/{d}/scenes.json","w"),ensure_ascii=False,indent=1)
print("ok")
