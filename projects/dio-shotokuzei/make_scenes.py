# Generates scenes.json for 本当は学校で教えてほしいシリーズ「所得税」（ジオラマ版）
import json, os
A = True
def T(text, act, sp="teacher", **kw):
    vis = dict(type="dio", act=act, **kw.pop("vis", {}))
    return dict(role=kw.pop("role", "mechanism"), speaker=sp, text=text, visual=vis, **kw)
sc = [
 T("初めての給料、/なんで/少ないの？", "payslip", sp="student", role="hook", cps=7.0, tail=0.45),
 T("税金や/社会保険料が/引かれるからです。", "deduct", role="premise"),
 T("翌年からは/住民税も/引かれます。", "juminzei", role="premise", asof=A, note="※前年の所得にかかるため、一般に働き始めた翌年の6月ごろから"),
 T("でも、/誰も/教えてくれませんでした。", "alone", role="premise"),
 T("そんなお金の授業を、/面白く/解説します。", "school", role="premise"),
 T("今回の授業は/「所得税」です。", "title", role="premise", vis=dict(title="所得税")),
 T("所得税は、/所得に応じて/納める税金です。", "define"),
 T("本来は/自分で計算して/納める制度です。", "selfcalc"),
 T("でも日本は、/会社員が/とても多いです。", "commuters"),
 T("そこで/会社が/給料から先に/引いて納めます。", "truck"),
 T("徴収漏れを/防げます。", "safe"),
 T("納める人の/手間も/減ります。", "relax"),
 T("この天引きを/源泉徴収と/いいます。", "sign", vis=dict(label="源泉徴収")),
 T("源泉、/つまり/出どころで/集める仕組みです。", "spring"),
 T("ただし、/毎月の額は/見込みです。", "estimate"),
 T("1年の収入を/予想して、/概算で引いています。", "estimate2", asof=A),
 T("だから/12月に/ズレが出ます。", "scale", asof=A, note="※年末調整は通常、その年の最後の給料のとき"),
 T("1年分を/正しく/計算し直します。", "recalc", asof=A),
 T("取りすぎなら/返してもらえます。", "refund", role="example"),
 T("足りなければ/追加で/引かれます。", "extra", role="example"),
 T("これを/年末調整と/いいます。", "sign", vis=dict(label="年末調整")),
 T("生命保険料や/地震保険料も、/ここで反映します。", "insurance"),
 T("出し忘れると、/戻るはずの税金が/戻りません。", "forget", note="※あとから確定申告で取り戻せる場合もあります"),
 T("知識を/しっかり/たくわえておきましょう。", "savings", role="summary"),
 T("今日の授業は/ここまでです。", "end", role="summary"),
 T("生きるための/お金の知識、/次回もお届けします。", "next", role="summary"),
 dict(role="disclaimer", speaker="teacher", text="情報提供目的です。/投資判断は/ご自身で。", visual=dict(type="disclaimer3d")),
]
spec = dict(title="本当は学校で教えてほしいシリーズ「所得税」（ジオラマ版）", series="本当は学校で教えてほしいシリーズ",
            episode="所得税", asof="2026年11月時点", pr=False, renderer="3d", theme="diorama", sub_style="telop",
            voice=dict(cps=5.0, tail=1.0), max_scene=5.3, scenes=sc)
here = os.path.dirname(os.path.abspath(__file__))
json.dump(spec, open(os.path.join(here, "scenes.json"), "w"), ensure_ascii=False, indent=1)
print("ok", len(sc))
