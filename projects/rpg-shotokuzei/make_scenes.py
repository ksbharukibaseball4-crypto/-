# 本当は学校で教えてほしいシリーズ「所得税」（レトロRPG風・オリジナル）
import json, os
A = True
def N(text, v, **kw): return dict(role=kw.pop("role", "mechanism"), speaker="narr", text=text, visual=dict(type="rpg", **v), **kw)
def H(text, v, **kw): return dict(role=kw.pop("role", "mechanism"), speaker="hero", text=text, visual=dict(type="rpg", **v), **kw)
def T(text, v, **kw): return dict(role=kw.pop("role", "mechanism"), speaker="sage", text=text, visual=dict(type="rpg", **v), **kw)
sc = [
 N("初めての給料を/手に入れた！", dict(kind="map", at="home", event="chest"), role="hook", cps=7.0, tail=0.45),
 H("あれ？/思ったより/少ない…", dict(kind="map", at="home", event="sad"), role="premise"),
 N("税金たちが/あらわれた！", dict(kind="battle", enemies=["shotoku", "shakai"], event="encounter"), role="premise"),
 N("給料から/税金が/引かれた！", dict(kind="battle", enemies=["shotoku", "shakai"], event="hit"), role="premise"),
 N("翌年からは/住民税も/あらわれる！", dict(kind="battle", enemies=["shotoku", "shakai", "jumin"], event="join"), role="premise", asof=A, note="※前年の所得にかかるため、一般に働き始めた翌年の6月ごろから"),
 H("誰も/教えてくれなかった…", dict(kind="map", at="crossroad", event="alone"), role="premise"),
 T("ならば/わしが/教えよう。", dict(kind="map", at="crossroad", event="sage_in"), role="premise"),
 N("第1章/「所得税」", dict(kind="title", chapter="第1章", title="所得税"), role="premise", asof=A),
 T("所得税は、/所得に応じて/納める税金じゃ。", dict(kind="status")),
 T("本来は/自分で計算して/納めるものじゃ。", dict(kind="map", at="home", event="calc")),
 T("じゃが日本は、/会社員が/とても多い。", dict(kind="map", at="company", event="crowd")),
 T("そこで会社が/先に引いて/国に納めるのじゃ。", dict(kind="map", at="road", event="cart")),
 N("「源泉徴収」の/しくみを/知った！", dict(kind="skill", name="源泉徴収", desc="会社が給料から先に税金を引き、国に納める")),
 T("源泉、/つまり/お金の出どころで/集めるのじゃ。", dict(kind="map", at="fountain", event="spring")),
 T("取り漏れが/なくなり、/手間も減る。", dict(kind="effects", lines=["取り漏れを防ぐ", "納める手間が減る"])),
 T("ただし、/毎月の額は/見込みじゃ。", dict(kind="months")),
 T("1年の収入を/予想した/概算なのじゃ。", dict(kind="months", labels=True), asof=A),
 N("12月、/ズレが/あらわれた！", dict(kind="battle", enemies=["zure"], event="encounter"), asof=A, note="※年末調整は通常、その年の最後の給料のとき"),
 T("年末調整で/正しく/計算し直す！", dict(kind="battle", enemies=["zure"], event="spell", spell="年末調整"), asof=A),
 N("取りすぎた税金が/戻ってきた！", dict(kind="battle", enemies=[], event="refund"), role="example"),
 N("足りないときは/追加で/引かれる。", dict(kind="battle", enemies=[], event="extra"), role="example"),
 T("生命保険料や/地震保険料も/ここで反映じゃ。", dict(kind="items", items=["生命保険料の控除証明書", "地震保険料の控除証明書", "扶養控除等申告書"])),
 T("書類を/出し忘れると、/税金が戻らんぞ。", dict(kind="map", at="home", event="wind"), note="※あとから確定申告で取り戻せる場合もあります"),
 N("年末調整の/しくみを/おぼえた！", dict(kind="levelup", stat="お金の知識"), role="summary"),
 T("今日の授業は/ここまでじゃ。", dict(kind="map", at="school", event="bye"), role="summary"),
 N("次回も/お楽しみに！", dict(kind="end"), role="summary"),
 dict(role="disclaimer", speaker="narr", text="情報提供目的です。/投資判断は/ご自身で。", visual=dict(type="disclaimer3d")),
]
spec = dict(title="本当は学校で教えてほしいシリーズ「所得税」（レトロRPG風）", series="本当は学校で教えてほしいシリーズ",
            episode="所得税", asof="2026年11月時点", pr=False, renderer="3d", theme="rpg",
            voice=dict(cps=5.0, tail=1.0), max_scene=5.3, scenes=sc)
here = os.path.dirname(os.path.abspath(__file__))
json.dump(spec, open(os.path.join(here, "scenes.json"), "w"), ensure_ascii=False, indent=1)
print("ok", len(sc))
