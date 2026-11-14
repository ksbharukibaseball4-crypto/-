# 本当は学校で教えて欲しいシリーズ「所得税」（ブロック風3D・ユーザー台本準拠）
# 台本の文言はそのまま使い、1画面20字以内になるよう読点で区切っている。cont=True は前の場面の映像を続ける。
import json, os
A = True
def L(text, act, cont=False, **kw):
    tail = kw.pop("tail", 0.35 if text.rstrip().endswith("、") else 0.95)
    return dict(role=kw.pop("role", "mechanism"), speaker="narr", text=text, tail=tail,
                visual=dict(type="vx", act=act, cont=cont, **kw.pop("vis", {})), **kw)
sc = [
 L("本当は/学校で教えて欲しい/シリーズ", "title", role="hook", vis=dict(title="本当は学校で教えて欲しいシリーズ"), cps=7.0, tail=0.45),
 L("新社会人になって、", "payday", role="premise"),
 L("いきなり給与から、", "payday", cont=True, role="premise"),
 L("税金や社会保険料が/引かれる。", "payday", cont=True, role="premise"),
 L("1年後には/住民税が/引かれる。", "juminzei", role="premise", asof=A, note="※住民税は前年の所得にかかるため、一般に翌年6月ごろから"),
 L("何も知らない、/誰も教えてくれない/まま。", "alone", role="premise"),
 L("そんなお金の授業を、", "school", role="premise"),
 L("わかりやすく、/面白く/解説していきます。", "school", cont=True, role="premise"),
 L("今回の授業は/「所得税」。", "title_ep", role="premise", vis=dict(title="所得税")),
 L("では、/ご覧ください。", "title_ep", cont=True, role="premise"),
 L("所得税は、/皆さんの/所得に応じて、", "define"),
 L("その一部を/税金として/納めるシステムです。", "define", cont=True),
 L("本来は/自分で申告して/税額を計算し、", "selfcalc"),
 L("納める制度でしたが、", "selfcalc", cont=True),
 L("日本では、/給与所得者、", "commuters"),
 L("いわゆる/会社勤めの/サラリーマンが多いので、", "commuters", cont=True),
 L("給与を支払う/会社側が、", "company"),
 L("あらかじめ/給与から/税金を差し引いて、", "company", cont=True),
 L("支払うことで、", "company", cont=True),
 L("税金の/徴収漏れを/防いだり、", "vault"),
 L("納税者の/負担を/減らすことができます。", "relax"),
 L("この/会社が給与から/天引きするシステムを", "sign", vis=dict(label="源泉徴収")),
 L("源泉徴収/といいます。", "sign", cont=True, vis=dict(label="源泉徴収")),
 L("「源泉」、/いわゆる源から、", "spring"),
 L("税金を徴収する/システムです。", "spring", cont=True),
 L("ただし、/あくまでこの天引きは、", "months"),
 L("月額の給与から、/1年間の収入を予測して、", "months", cont=True, asof=A),
 L("概算で/徴収しているため、", "months", cont=True, asof=A),
 L("12月の時点で、/税金を/取りすぎていたり、", "december", asof=A),
 L("少ない場合が/あります。", "december", cont=True, asof=A),
 L("1年間の給与の額を/正確に計算し、", "recalc", asof=A),
 L("取りすぎていた税金は/返し、", "refund", role="example"),
 L("少なかった場合は/改めて徴収する。", "extra", role="example"),
 L("これを/年末調整/といいます。", "sign_nenmatsu", vis=dict(label="年末調整"), note="※通常はその年の最後の給料のとき"),
 L("日々支払っている/生命保険や地震保険など、", "insurance"),
 L("各種控除を/このタイミングで整理し、", "insurance", cont=True),
 L("改めて/計算します。", "insurance", cont=True),
 L("年末調整で/しっかり整理しないと、", "forget"),
 L("返ってくるはずの税金が、", "forget", cont=True),
 L("返ってこなくなってしまうので、", "forget", cont=True, note="※出し忘れても、確定申告で取り戻せる場合があります"),
 L("しっかりと/知識を/蓄えておきましょう。", "books", role="summary"),
 L("今日の授業は、/ここまで。", "sunset", role="summary"),
 L("生きていく上で、/大切なお金の知識、", "sunset", cont=True, role="summary"),
 L("次回も/お楽しみに。", "sunset", cont=True, role="summary"),
 dict(role="disclaimer", speaker="narr", text="情報提供目的です。/投資判断は/ご自身で。", visual=dict(type="disclaimer3d")),
]
spec = dict(title="本当は学校で教えて欲しいシリーズ「所得税」（ブロック風3D）", series="本当は学校で教えて欲しいシリーズ",
            episode="所得税", asof="2026年11月時点", pr=False, renderer="3d", theme="voxel", sub_style="telop",
            voice=dict(cps=5.5, tail=0.95), max_scene=5.3, scenes=sc)
here = os.path.dirname(os.path.abspath(__file__))
json.dump(spec, open(os.path.join(here, "scenes.json"), "w"), ensure_ascii=False, indent=1)
print("ok", len(sc))
