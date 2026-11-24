#!/usr/bin/env python3
"""Fill Chinese meanings for the filtered Shengjing cloze vocabulary backup."""

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

SOURCE = Path("快速記憶法備份 2_已篩除完整句子.json")
REFERENCE = Path("快速記憶法備份 5_晟景克漏字.json")
OUTPUT = Path("快速記憶法備份 2_晟景已補中文.json")
DELIMITER = "\n---SPLIT---\n"

# Context-aware definitions for entries not present in the earlier Shengjing
# backup. Semicolons preserve distinct common senses where the entry is a word.
MANUAL_MEANINGS = {
    "thoroughly": "徹底地；完全地；仔細地", "term": "術語；學期；期限；條件",
    "coined": "創造（新詞）；鑄造（硬幣）", "watched over": "照看；守護；監視",
    "protests": "抗議；反對；申明反對", "counseling sessions": "諮商會談；輔導課程",
    "At the very least": "至少；最低限度地說", "intrusiveness breeds": "過度干涉會滋生；侵擾性導致",
    "coddled": "溺愛；嬌養；過度縱容", "apt": "恰當的；易於…的；聰慧的",
    "accustomed": "習慣於；慣常的", "nature pattern": "自然模式；天性規律",
    "initiated": "發起；開始；使入門", "a record of their daily lives with photos": "以照片記錄他們日常生活的紀錄",
    "for the sake of": "為了；為…的緣故", "attend": "出席；參加；照料；專心於",
    "contracts": "合約；契約；收縮；感染（疾病）", "defines": "定義；界定；說明特徵",
    "digital natives": "數位原生世代；自幼接觸數位科技的人", "Consequently": "因此；結果；所以",
    "constant need": "持續的需求；經常性的需要", "highly-driven": "企圖心很強的；高度自我驅動的",
    "demonstrate a commitment": "展現承諾；表明投入的決心", "integrated": "整合的；融合的；使成為一體的",
    "rigid job": "僵化的工作；缺乏彈性的職務", "breach sophisticated": "突破精密的（防護／系統）",
    "innocently": "天真地；無辜地；沒有惡意地", "is owing to": "歸因於；是由於",
    "is credited with": "被認為有…功勞；以…聞名", "flaw": "瑕疵；缺點；裂紋",
    "patent": "專利；取得專利；顯而易見的", "have an impact on": "對…有影響；衝擊",
    "get along well with": "與…相處融洽", "the painting": "那幅畫；繪畫行為",
    "ill omen": "不祥之兆；壞預兆", "trait": "特徵；特性；性格特質",
    "span": "跨度；期間；橫跨；涵蓋", "index": "索引；指數；指標；食指",
    "permanently": "永久地；長久地", "remedy": "補救方法；藥方；補救",
    "brief animated": "簡短而生動的；短篇動畫的", "treating": "治療；對待；款待",
    "Similarly": "同樣地；類似地", "come a long way from then on": "自那時起有長足進步；走了很長一段路",
    "basic instincts": "基本本能；原始直覺", "pleasure": "愉悅；樂趣；享受；意願",
    "in mind": "在心中；記得；考慮到", "is said to": "據說；被認為",
    "womb": "子宮；孕育之處", "For instance": "例如；舉例來說",
    "takes the focus off": "把焦點從…移開；分散對…的注意", "Birth order": "出生順位；手足排行",
    "lasting effect": "持久的影響；長遠效果", "instincts": "本能；直覺",
    "pleasant": "令人愉快的；和藹的；宜人的", "tumors": "腫瘤；腫塊",
    "Later on": "後來；稍後", "hinted": "暗示；示意；提示",
    "immune": "免疫的；不受影響的；免除的", "blueprint": "藍圖；設計圖；行動計畫",
    "through": "穿過；透過；從頭到尾；完成的", "catch on": "理解；流行起來；抓住",
    "come around": "改變主意；恢復知覺；順道拜訪", "commercially": "商業上地；以營利方式",
    "counterparts": "對應的人／物；同等職位者", "enthusiasm": "熱情；熱忱",
    "geared": "為…而設計的；配備齒輪的", "humble": "謙遜的；卑微的；簡陋的",
    "applaud": "鼓掌；稱讚；贊同", "individuals": "個人；個體",
    "position": "位置；職位；立場；安放", "forms": "形式；表格；形成；構成",
    "interaction": "互動；相互作用", "altered": "改變的；修改過的",
    "preferences": "偏好；優先選擇", "stake": "利害關係；股份；賭注；樁",
    "sense": "感覺；意義；理智；感知", "assemble": "集合；組裝；召集",
    "plays tricks on": "捉弄；欺騙；使…產生錯覺", "gets even with": "向…報復；和…扯平",
    "epidemic": "流行病；盛行的事物", "obese": "肥胖的；過胖的",
    "appeared": "出現；顯得；似乎", "strict": "嚴格的；嚴謹的；精確的",
    "bars": "酒吧；條狀物；欄杆；阻止", "frame": "框架；畫框；構成；陷害",
    "fateful": "決定命運的；重大的；不祥的", "maturity": "成熟；成年；到期",
    "call up": "打電話給；召集；喚起；徵召", "reconcile": "調和；和解；使一致",
    "torn": "撕裂的；痛苦矛盾的", "comes across": "偶然遇見；給人…印象；被理解",
    "birthrate": "出生率", "housing": "住宅；住房；外殼",
    "left": "左邊；左派；離開；剩下的", "comes out of": "從…出來；源自於；擺脫",
    "among bosses": "在老闆們之中；在主管之間", "undermine": "暗中削弱；損害；侵蝕",
    "defects": "缺陷；瑕疵；背叛；叛逃", "upbringing": "養育；教養；成長背景",
    "virtually deficient": "實際上不足的；幾乎缺乏的", "looking down on": "瞧不起；輕視",
    "general": "一般的；全面的；將軍", "day dreams": "白日夢；幻想",
    "gift-wrapped Bible": "以禮物包裝的《聖經》", "stormed out": "怒氣沖沖地離開",
    "possessions": "財產；所有物；擁有", "exact amount of": "確切數量的；精準的金額",
    "worked out": "算出；解決；鍛鍊；結果順利", "bombarded with": "受到…連番轟炸；大量充斥著",
    "closed with": "以…結束；關閉時帶著", "appealed for": "呼籲；懇求；上訴請求",
    "could not help but": "忍不住；不得不", "flew into a rage": "勃然大怒；暴跳如雷",
    "refusing": "拒絕；不肯", "sows": "播種；散布；種植",
    "sinner alike": "罪人也同樣；不分善惡", "volunteers": "志工；自願者；自願提供",
    "catalogues": "目錄；編目；列舉", "formation": "形成；構造；編隊",
    "more to the": "更多的是；進一步說", "evolved": "演化；發展；逐漸形成",
    "recited": "背誦；朗誦；列舉", "sustained": "維持；支撐；持續的；遭受",
    "aroused": "喚起；激起；叫醒", "persist in": "堅持；持續做",
    "meant to": "意圖；打算；注定要", "drove them on": "驅使他們前進；促使他們繼續",
    "making progress": "取得進展；進步", "looks like": "看起來像；似乎",
    "applied": "申請；應用；適用於；塗抹", "complex, living, changing human being": "複雜、有生命且不斷變化的人類個體",
    "demonstrates": "展示；證明；表明", "external circumstances": "外在環境；外部情況",
    "distinguishes": "區分；辨別；使出眾", "obsessed with": "對…著迷；沉迷於",
    "resolutions": "決議；解決辦法；決心；解析度", "board-certified psychiatrist": "取得專科認證的精神科醫師",
    "well-defined measurable outcome": "明確界定且可衡量的成果", "outcome details": "結果細節；成果詳情",
    "fitting into a certain outfit": "穿得進某套衣服；符合某種裝扮", "left behind": "留下；落後；遺留",
    "alternatives": "替代方案；其他選擇", "different series": "不同系列；不同連續組",
    "give away nearly all": "幾乎全數捐出；幾乎全送掉", "charitable foundations": "慈善基金會",
    "successful charities": "成功的慈善機構；成效良好的公益組織", "involved": "涉及；參與；複雜的",
    "donations": "捐款；捐贈物", "thorough evaluation": "徹底評估；全面檢核",
    "poorly used": "使用不當；未善加利用", "struggled with": "與…奮鬥；艱難應對",
    "served as": "擔任；作為；充當", "charitable efforts": "慈善工作；公益努力",
    "battle against": "與…對抗；抗爭", "land mines": "地雷；潛在危險",
    "grants": "補助金；授予；批准", "refugees": "難民；避難者",
    "Britons": "英國人", "remarkable legacy": "非凡的遺產；卓越的傳承",
    "drew to": "把…吸引到；拉向", "fairy-tale": "童話；如童話般的",
    "endeared": "使受喜愛；使討人喜歡", "lit up": "照亮；點亮；顯得高興",
    "were nearsighted": "近視的；目光短淺的", "sparkled with greed": "眼中閃爍著貪婪",
    "squeezed out": "擠出；榨出；排擠出去", "headed": "朝向；帶領；有…頭部的",
    "coal mines": "煤礦；煤坑", "meditating": "冥想；沉思",
    "dawned on me": "我開始明白；我恍然大悟", "strains": "拉傷；壓力；菌株；品種",
    "antibiotics": "抗生素", "wipes out": "消滅；徹底摧毀；擦掉",
    "blends with": "與…融合；混合得協調", "swallowed": "吞下；淹沒；忍住",
    "terminated": "終止；結束；解僱", "caused a stir": "引起騷動；造成轟動",
    "spelled doom": "預示厄運；意味著毀滅", "delivered benefits": "帶來益處；發放福利",
    "insisted on": "堅持；堅決要求", "course": "課程；路線；過程；一道菜",
    "assessing": "評估；估價；判定", "taking into": "把…納入考量；帶入",
    "cables": "電纜；纜線；有線傳輸", "chips": "晶片；薯片；碎屑",
    "nervous system": "神經系統", "transport goods": "運送貨物；運輸商品",
    "transmit information": "傳遞資訊；傳輸訊息", "trades with": "與…貿易；交換",
    "tumbles over": "跌倒在…上；笨拙地說錯", "consists in": "在於；由…構成",
    "contracting": "收縮；簽訂合約；感染（疾病）", "vaccines": "疫苗",
    "parasites": "寄生蟲；寄生者", "eliminating": "消除；淘汰；排除",
    "modifying": "修改；調整；修飾", "compounds": "化合物；複合物；使加劇",
    "modified": "修改過的；調整過的", "mosquitoes": "蚊子",
    "astronauts": "太空人；宇航員", "rear-mounted suction": "後置式吸力裝置；後方安裝的抽吸裝置",
    "draws": "畫；拉；吸引；抽取", "incorporate features": "納入特徵；整合功能",
    "heading": "標題；方向；前往", "crucial role": "關鍵角色；至關重要的作用",
    "maintaining": "維持；保養；主張", "determines": "決定；判定；確定",
    "lies in": "在於；位於", "Carmakers": "汽車製造商",
    "ground transmitter": "地面發射器", "own seamless": "自有的無縫式；自己的流暢整合",
    "manipulated": "操控；操縱；篡改；熟練操作", "masters": "大師；主人；精通；掌握",
    "shows off": "炫耀；賣弄；展示", "uncovered": "發現；揭露；未覆蓋的",
    "frequencies": "頻率；出現次數", "humming": "嗡嗡作響；哼唱；忙碌運轉",
    "crater dubbed": "被命名為…的隕石坑", "reserves": "儲備；保留；預備隊",
    "drilling": "鑽孔；訓練；反覆操練", "recommended": "推薦；建議；值得推薦的",
    "gaze into": "凝視；注視…之中", "fiery depths": "火熱深處；烈焰深淵",
    "destructive": "破壞性的；毀滅性的", "abundant": "豐富的；充足的；大量的",
    "triggered": "觸發；引起；扣動（扳機）", "consented": "同意；允許",
    "exploited": "利用；剝削；開發", "scalp electrodes": "頭皮電極",
    "perceive": "察覺；理解；看待",
}


def normalize(term: str) -> str:
    return re.sub(r"\s+", " ", term.strip().lower())


def translate_batch(terms: list[str]) -> list[str]:
    query = urlencode({"q": DELIMITER.join(terms), "langpair": "en|zh-TW"})
    url = f"https://api.mymemory.translated.net/get?{query}"
    for attempt in range(3):
        try:
            with urlopen(url, timeout=35) as response:
                payload = json.loads(response.read().decode("utf-8"))
            translated = payload["responseData"]["translatedText"]
            pieces = [piece.strip() for piece in translated.split(DELIMITER)]
            if len(pieces) == len(terms) and all(pieces):
                return pieces
        except Exception:
            pass
        time.sleep(1 + attempt)
    return [""] * len(terms)


def batches(terms: list[str], max_characters: int = 360) -> list[list[str]]:
    result: list[list[str]] = []
    current: list[str] = []
    size = 0
    for term in terms:
        added = len(term) + (len(DELIMITER) if current else 0)
        if current and size + added > max_characters:
            result.append(current)
            current, size = [], 0
        current.append(term)
        size += len(term) + (len(DELIMITER) if len(current) > 1 else 0)
    if current:
        result.append(current)
    return result


data = json.loads(SOURCE.read_text(encoding="utf-8"))
reference = json.loads(REFERENCE.read_text(encoding="utf-8"))

reference_meanings = {
    normalize(word["term"]): word["meaning"].strip()
    for word in reference["words"]
    if word.get("unitId", "").startswith("shengjing-") and word.get("meaning", "").strip()
}

shengjing_words = [word for word in data["words"] if word.get("unitId", "").startswith("shengjing-")]
unmatched_terms: list[str] = []
for word in shengjing_words:
    meaning = reference_meanings.get(normalize(word["term"])) or MANUAL_MEANINGS.get(word["term"])
    if meaning:
        word["meaning"] = meaning
    else:
        unmatched_terms.append(word["term"])

translations: dict[str, str] = {}
groups = batches(unmatched_terms)
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {executor.submit(translate_batch, group): group for group in groups}
    for future in as_completed(futures):
        group = futures[future]
        for term, meaning in zip(group, future.result()):
            if meaning:
                translations[term] = meaning

for word in shengjing_words:
    if not word.get("meaning", "").strip():
        word["meaning"] = translations.get(word["term"], "（待補中文）")

data["updatedAt"] = int(time.time() * 1000)
OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

filled = sum(bool(word.get("meaning", "").strip()) for word in shengjing_words)
pending = [word["term"] for word in shengjing_words if word.get("meaning") == "（待補中文）"]
print(json.dumps({"total": len(shengjing_words), "filled": filled, "pending": pending}, ensure_ascii=False))
