"""Generate the starter lesson library (lessons.json).

Run:  python -m app.lesson_engine.content.build_content

Every expected answer is *computed* from operands here, never typed by hand,
so a template typo cannot produce a wrong answer key.

IMPORTANT: this content is a DRAFT prepared by the BoltiToli team. It is
seeded with status "draft" and must be reviewed by a teacher (Lessons ->
Review) before it is shown as "teacher-reviewed" anywhere in the product.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.lesson_engine.hindi_numbers import number_to_hindi

OUT = Path(__file__).with_name("lessons.json")

# noun: (singular, plural, gender) ; gender m|f drives verb/adjective agreement
NOUNS = {
    "apple": ("सेब", "सेब", "m"),
    "mango": ("आम", "आम", "m"),
    "ball": ("गेंद", "गेंदें", "f"),
    "stick": ("तीली", "तीलियाँ", "f"),
    "laddoo": ("लड्डू", "लड्डू", "m"),
    "leaf": ("पत्ता", "पत्ते", "m"),
}
NOUNS_EN = {"apple": "apples", "mango": "mangoes", "ball": "balls", "stick": "sticks", "laddoo": "laddoos",
            "leaf": "leaves"}


def n_form(obj: str, n: int) -> str:
    s, p, _ = NOUNS[obj]
    return s if n == 1 else p


def hai(n: int) -> str:
    return "है" if n == 1 else "हैं"


def kitne(obj: str) -> str:
    return "कितनी" if NOUNS[obj][2] == "f" else "कितने"


def counting_words(start: int, end: int) -> str:
    return ", ".join(number_to_hindi(i) for i in range(start, end + 1))


def q(diff: int, kind: str, prompt_hi: str, prompt_en: str, operands: dict, answer: int, hint: str,
      explanation: str, visual: dict | None) -> dict:
    return {"difficulty": diff, "kind": kind, "prompt_hi": prompt_hi, "prompt_en": prompt_en,
            "operands": operands, "expected_answer": answer, "hint_hi": hint, "explanation_hi": explanation,
            "visual": visual}


# --------------------------------------------------------------------------- #
def count_questions() -> list[dict]:
    items = [(1, 3, "apple"), (1, 2, "ball"), (1, 4, "mango"), (1, 5, "laddoo"), (1, 1, "leaf"),
             (2, 6, "stick"), (2, 7, "apple"), (2, 8, "ball"), (2, 6, "leaf"), (2, 7, "mango"),
             (3, 9, "laddoo"), (3, 10, "apple"), (3, 9, "stick"), (3, 10, "ball"), (3, 8, "leaf")]
    out = []
    for d, n, obj in items:
        pl = NOUNS[obj][1]
        out.append(q(d, "count", f"देखो, यहाँ {kitne(obj)} {pl} हैं? गिनकर बताओ।",
                     f"Look, how many {NOUNS_EN[obj]} are here? Count and tell.", {"n": n}, n,
                     "हर चीज़ को एक-एक करके छूकर गिनो। जो गिन लिया, उसे अलग रखो।",
                     f"चलो साथ में गिनें: {counting_words(1, n)}। कुल {n} {n_form(obj, n)} {hai(n)}।",
                     {"type": "objects", "object": obj, "groups": [n], "op": None}))
    return out


def before_after_questions() -> list[dict]:
    items = [(1, 3, "after"), (1, 5, "after"), (1, 7, "after"), (1, 8, "after"), (1, 6, "before"),
             (2, 11, "after"), (2, 13, "after"), (2, 12, "before"), (2, 15, "after"), (2, 10, "after"),
             (3, 17, "after"), (3, 19, "after"), (3, 16, "before"), (3, 20, "before"), (3, 18, "before")]
    out = []
    for d, n, ask in items:
        ans = n + 1 if ask == "after" else n - 1
        rel = "के बाद" if ask == "after" else "से पहले"
        out.append(q(d, "before_after", f"{n} {rel} कौन सी संख्या आती है?",
                     f"Which number comes {ask} {n}?", {"n": n, "ask": ask}, ans,
                     f"गिनती बोलो और {n} पर रुको। {'उसके बाद' if ask == 'after' else 'उससे पहले'} क्या आता है?",
                     (f"{n} के बाद {ans} आता है, क्योंकि {n} में एक जोड़ो तो {ans} होता है।" if ask == "after"
                      else f"{n} से पहले {ans} आता है, क्योंकि {n} में से एक घटाओ तो {ans} होता है।"),
                     {"type": "number_line", "from": max(0, n - 3), "to": n + 3, "highlight": n, "ask": ask}))
    return out


def compare_questions() -> list[dict]:
    items = [(1, 2, 7), (1, 9, 4), (1, 3, 8), (1, 6, 1), (1, 5, 9),
             (2, 7, 12), (2, 14, 9), (2, 11, 16), (2, 18, 13), (2, 10, 6),
             (3, 17, 19), (3, 16, 15), (3, 12, 13), (3, 20, 18), (3, 14, 19)]
    out = []
    for d, a, b in items:
        big, small = max(a, b), min(a, b)
        out.append(q(d, "compare", f"{a} और {b} में कौन सी संख्या बड़ी है?",
                     f"Which is bigger, {a} or {b}?", {"a": a, "b": b}, big,
                     "गिनती में जो संख्या बाद में आती है, वह बड़ी होती है।",
                     f"गिनती में {big}, {small} के बाद आता है, इसलिए {big} बड़ा है।",
                     {"type": "compare", "values": [a, b]}))
    return out


def place_value_questions() -> list[dict]:
    items = [(1, 20, "tens"), (1, 30, "tens"), (1, 14, "tens"), (1, 50, "tens"), (1, 12, "ones"),
             (2, 34, "tens"), (2, 47, "tens"), (2, 26, "ones"), (2, 58, "ones"), (2, 71, "tens"),
             (3, 63, "ones"), (3, 89, "tens"), (3, 45, "ones"), (3, 92, "tens"), (3, 37, "ones")]
    out = []
    for d, n, ask in items:
        tens, ones = divmod(n, 10)
        ans = tens if ask == "tens" else ones
        if ask == "tens":
            prompt = f"{n} में कितनी दहाइयाँ हैं?"
            en = f"How many tens are in {n}?"
        else:
            prompt = f"{n} में कितनी इकाइयाँ हैं?"
            en = f"How many ones are in {n}?"
        out.append(q(d, "place_value", prompt, en, {"n": n, "ask": ask}, ans,
                     "दस तीलियों का एक बंडल एक दहाई होता है। अकेली तीलियाँ इकाई होती हैं।",
                     f"{n} में {tens} बंडल यानी {tens} दहाई, और {ones} अकेली तीलियाँ यानी {ones} इकाई हैं।",
                     {"type": "bundles", "tens": tens, "ones": ones}))
    return out


def add10_questions() -> list[dict]:
    items = [(1, 2, 1, "apple"), (1, 1, 3, "ball"), (1, 2, 2, "mango"), (1, 3, 1, "laddoo"), (1, 2, 3, "leaf"),
             (2, 3, 2, "apple"), (2, 4, 3, "ball"), (2, 5, 2, "stick"), (2, 3, 4, "mango"), (2, 6, 2, "laddoo"),
             (3, 6, 3, "ball"), (3, 5, 4, "apple"), (3, 7, 3, "stick"), (3, 4, 6, "leaf"), (3, 6, 4, "mango")]
    out = []
    for d, a, b, obj in items:
        s = a + b
        pl = NOUNS[obj][1]
        verb = "हुईं" if NOUNS[obj][2] == "f" else "हुए"
        out.append(q(d, "add",
                     f"यहाँ {a} {n_form(obj, a)} {hai(a)}, और यहाँ {b} {n_form(obj, b)} {hai(b)}। "
                     f"कुल {kitne(obj)} {pl} {verb}?",
                     f"Here are {a} and here are {b} {NOUNS_EN[obj]}. How many in all?", {"a": a, "b": b}, s,
                     f"{a} याद रखो, फिर दूसरे समूह को आगे गिनो।",
                     f"{a} के आगे गिनो: {counting_words(a + 1, s)}। {a} और {b} मिलकर {s} होते हैं।",
                     {"type": "objects", "object": obj, "groups": [a, b], "op": "+"}))
    return out


def sub10_questions() -> list[dict]:
    items = [(1, 3, 1, "laddoo"), (1, 4, 2, "apple"), (1, 5, 1, "ball"), (1, 4, 1, "mango"), (1, 5, 3, "leaf"),
             (2, 6, 2, "laddoo"), (2, 7, 3, "apple"), (2, 8, 4, "stick"), (2, 6, 3, "ball"), (2, 7, 2, "mango"),
             (3, 9, 4, "laddoo"), (3, 10, 3, "apple"), (3, 9, 6, "ball"), (3, 10, 7, "stick"),
             (3, 8, 5, "leaf")]
    out = []
    for d, a, b, obj in items:
        r = a - b
        fem = NOUNS[obj][2] == "f"
        removed = "हटा दीं" if fem else "हटा दिए"
        if b == 1:
            removed = "हटा दी" if fem else "हटा दिया"
        left = "बचीं" if fem else "बचे"
        out.append(q(d, "sub",
                     f"यहाँ {a} {n_form(obj, a)} {hai(a)}। उनमें से {b} {n_form(obj, b)} {removed}। "
                     f"अब {kitne(obj)} {NOUNS[obj][1]} {left}?",
                     f"There are {a} {NOUNS_EN[obj]}. {b} are taken away. How many are left?", {"a": a, "b": b}, r,
                     "सब गिनो, फिर हटाई गई चीज़ें अलग करो और जो बचा उसे गिनो।",
                     f"{a} से पीछे गिनो: {', '.join(number_to_hindi(i) for i in range(a - 1, r - 1, -1))}। "
                     f"{a} में से {b} हटाने पर {r} बचते हैं।",
                     {"type": "objects", "object": obj, "groups": [a], "remove": b, "op": "-"}))
    return out


def sub20_questions() -> list[dict]:
    items = [(1, 17, 4), (1, 15, 3), (1, 19, 5), (1, 18, 6), (1, 16, 2),
             (2, 14, 4), (2, 12, 2), (2, 15, 5), (2, 20, 6), (2, 13, 3),
             (3, 13, 5), (3, 12, 7), (3, 14, 6), (3, 11, 4), (3, 16, 9)]
    out = []
    for d, a, b in items:
        r = a - b
        ones = a % 10
        if a > 10 and b > ones and ones > 0:
            expl = (f"{a} − {b}: पहले {ones} घटाओ तो 10 बचता है, फिर {b - ones} और घटाओ तो {r} बचता है।")
        else:
            expl = f"{a} में से {b} घटाने पर {r} बचता है। {a} से {b} कदम पीछे गिनो।"
        out.append(q(d, "sub", f"{a} में से {b} घटाओ, तो कितना बचेगा?", f"What is {a} minus {b}?",
                     {"a": a, "b": b}, r, "पहले 10 तक घटाओ, फिर बाकी घटाओ।", expl,
                     {"type": "bundles", "tens": a // 10, "ones": a % 10, "remove": b}))
    return out


def add2digit_questions() -> list[dict]:
    items = [(1, 20, 10), (1, 30, 20), (1, 12, 5), (1, 21, 4), (1, 40, 30),
             (2, 23, 14), (2, 32, 25), (2, 41, 36), (2, 15, 12), (2, 52, 27),
             (3, 28, 15), (3, 37, 26), (3, 19, 24), (3, 46, 18), (3, 55, 29)]
    out = []
    for d, a, b in items:
        s = a + b
        ones_sum = a % 10 + b % 10
        tens_sum = a // 10 + b // 10
        if ones_sum >= 10:
            expl = (f"इकाई: {a % 10} + {b % 10} = {ones_sum}। इसमें 1 दहाई बनी, {ones_sum - 10} इकाई बचीं। "
                    f"दहाई: {a // 10} + {b // 10} + 1 = {tens_sum + 1}। कुल {s}।")
        else:
            expl = f"इकाई: {a % 10} + {b % 10} = {ones_sum}। दहाई: {a // 10} + {b // 10} = {tens_sum}। कुल {s}।"
        out.append(q(d, "add", f"{a} और {b} को जोड़ो। कितना हुआ?", f"Add {a} and {b}.", {"a": a, "b": b}, s,
                     "पहले इकाई जोड़ो, फिर दहाई। दस इकाई हों तो एक दहाई बना लो।", expl,
                     {"type": "bundles_add", "a": [a // 10, a % 10], "b": [b // 10, b % 10]}))
    return out


def word_questions() -> list[dict]:
    T = [
        (1, "add", "मीना के पास {a} पेंसिलें हैं। उसकी दीदी ने उसे {b} पेंसिलें और दीं। अब मीना के पास कितनी पेंसिलें हैं?",
         "Meena has {a} pencils. Her sister gives her {b} more. How many now?", 3, 2),
        (1, "sub", "पेड़ पर {a} चिड़ियाँ बैठी थीं। {b} चिड़ियाँ उड़ गईं। अब पेड़ पर कितनी चिड़ियाँ हैं?",
         "{a} birds sat on a tree. {b} flew away. How many are left?", 5, 2),
        (1, "add", "अमन ने {a} आम तोड़े और रवि ने {b} आम तोड़े। दोनों ने मिलकर कितने आम तोड़े?",
         "Aman picked {a} mangoes and Ravi picked {b}. How many together?", 4, 3),
        (1, "sub", "थाली में {a} लड्डू थे। बच्चों ने {b} लड्डू खा लिए। अब कितने लड्डू बचे?",
         "There were {a} laddoos. Children ate {b}. How many are left?", 6, 3),
        (1, "add", "कक्षा में {a} लड़कियाँ और {b} लड़के हैं। कुल कितने बच्चे हैं?",
         "There are {a} girls and {b} boys. How many children?", 5, 4),
        (2, "add", "सलमा के पास {a} कंचे हैं। उसे खेल में {b} कंचे और मिले। अब उसके पास कितने कंचे हैं?",
         "Salma has {a} marbles and wins {b} more. How many now?", 8, 5),
        (2, "sub", "गुड्डू के पास {a} रुपये थे। उसने {b} रुपये की टॉफ़ी ली। अब उसके पास कितने रुपये बचे?",
         "Guddu had {a} rupees and spent {b}. How much is left?", 12, 4),
        (2, "add", "बस में {a} लोग थे। अगले स्टॉप पर {b} लोग और चढ़े। अब बस में कितने लोग हैं?",
         "{a} people were on a bus; {b} more got on. How many now?", 9, 6),
        (2, "sub", "किताबों की अलमारी में {a} किताबें थीं। बच्चों ने {b} किताबें पढ़ने के लिए लीं। अब कितनी किताबें बचीं?",
         "There were {a} books; children took {b}. How many are left?", 15, 5),
        (2, "sub", "खेत में {a} बकरियाँ थीं। {b} बकरियाँ घर चली गईं। अब खेत में कितनी बकरियाँ हैं?",
         "{a} goats were in a field; {b} went home. How many are left?", 14, 6),
        (3, "add", "पहले दिन {a} पौधे लगाए और दूसरे दिन {b} पौधे। कुल कितने पौधे लगाए?",
         "{a} plants on day one and {b} on day two. How many in all?", 9, 8),
        (3, "sub", "माली के पास {a} फूल थे। उसने {b} फूल माला में लगा दिए। अब कितने फूल बचे?",
         "A gardener had {a} flowers and used {b}. How many are left?", 17, 9),
        (3, "add", "रीना ने {a} रोटियाँ बनाईं और माँ ने {b} रोटियाँ। कुल कितनी रोटियाँ बनीं?",
         "Reena made {a} rotis and mother made {b}. How many in all?", 7, 8),
        (3, "sub", "डिब्बे में {a} चॉक थे। कक्षा में {b} चॉक इस्तेमाल हो गए। अब डिब्बे में कितने चॉक हैं?",
         "A box had {a} chalks; {b} were used. How many are left?", 16, 7),
        (3, "sub", "बगीचे में {a} तितलियाँ थीं। {b} तितलियाँ उड़ गईं। अब कितनी तितलियाँ बचीं?",
         "{a} butterflies; {b} flew away. How many are left?", 18, 9),
    ]
    out = []
    for d, op, hi, en, a, b in T:
        ans = a + b if op == "add" else a - b
        if op == "add":
            hint = "कहानी में चीज़ें बढ़ रही हैं, इसलिए जोड़ो।"
            expl = f"चीज़ें बढ़ीं, इसलिए जोड़ना है: {a} + {b} = {ans}।"
        else:
            hint = "कहानी में चीज़ें कम हो रही हैं, इसलिए घटाओ।"
            expl = f"चीज़ें कम हुईं, इसलिए घटाना है: {a} − {b} = {ans}।"
        out.append(q(d, "word_add" if op == "add" else "word_sub", hi.format(a=a, b=b), en.format(a=a, b=b),
                     {"a": a, "b": b}, ans, hint, expl, None))
    return out


SKILLS = [
    {"code": "count_to_10", "name_en": "Counting objects to 10", "name_hi": "10 तक चीज़ें गिनना",
     "level": "beginner", "grade_band": "1", "gen": count_questions,
     "objective_hi": "बच्चे 10 तक की चीज़ें एक-एक करके सही गिन पाएँ।",
     "topic_hi": "चीज़ें गिनना",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 1)", "ASER early number tasks"]},
    {"code": "number_sequence_20", "name_en": "Number before and after (to 20)",
     "name_hi": "20 तक पहले और बाद की संख्या", "level": "beginner", "grade_band": "1", "gen": before_after_questions,
     "objective_hi": "बच्चे 20 तक किसी संख्या से पहले और बाद की संख्या बता पाएँ।",
     "topic_hi": "पहले और बाद की संख्या",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 1)", "NCERT Math-Magic Class 1"]},
    {"code": "compare_within_20", "name_en": "Comparing numbers to 20", "name_hi": "20 तक संख्याओं की तुलना",
     "level": "developing", "grade_band": "1-2", "gen": compare_questions,
     "objective_hi": "बच्चे 20 तक की दो संख्याओं में बड़ी संख्या पहचान पाएँ।",
     "topic_hi": "बड़ी संख्या पहचानना",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 1-2)"]},
    {"code": "place_value_tens", "name_en": "Tens and ones", "name_hi": "दहाई और इकाई",
     "level": "developing", "grade_band": "2", "gen": place_value_questions,
     "objective_hi": "बच्चे 99 तक की संख्या में दहाई और इकाई पहचान पाएँ।",
     "topic_hi": "दहाई और इकाई",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 2)", "ASER two-digit number recognition"]},
    {"code": "add_within_10", "name_en": "Addition within 10", "name_hi": "10 तक जोड़",
     "level": "developing", "grade_band": "1-2", "gen": add10_questions,
     "objective_hi": "बच्चे चीज़ों के दो समूह मिलाकर 10 तक जोड़ पाएँ।",
     "topic_hi": "जोड़ना",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 1)", "NCERT Math-Magic Class 1"]},
    {"code": "sub_within_10", "name_en": "Subtraction within 10", "name_hi": "10 तक घटाव",
     "level": "advancing", "grade_band": "1-2", "gen": sub10_questions,
     "objective_hi": "बच्चे 10 तक की चीज़ों में से कुछ हटाकर बची हुई चीज़ें बता पाएँ।",
     "topic_hi": "घटाना",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 1-2)", "ASER subtraction task"]},
    {"code": "sub_within_20", "name_en": "Subtraction within 20 (bridging 10)", "name_hi": "20 तक घटाव (10 पार करके)",
     "level": "advancing", "grade_band": "2", "gen": sub20_questions,
     "objective_hi": "बच्चे 20 तक घटाव कर पाएँ, जिसमें 10 को पार करना भी शामिल है।",
     "topic_hi": "20 तक घटाना",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 2)", "ASER subtraction task"]},
    {"code": "add_two_digit", "name_en": "Two-digit addition with regrouping", "name_hi": "दो अंकों का जोड़ (हासिल के साथ)",
     "level": "advancing", "grade_band": "2-3", "gen": add2digit_questions,
     "objective_hi": "बच्चे दो अंकों की संख्याएँ जोड़ पाएँ, हासिल के साथ भी।",
     "topic_hi": "दो अंकों का जोड़",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 3)"]},
    {"code": "word_problems_20", "name_en": "Word problems within 20", "name_hi": "20 तक इबारती सवाल",
     "level": "advancing", "grade_band": "2-3", "gen": word_questions,
     "objective_hi": "बच्चे छोटी कहानी सुनकर पहचान पाएँ कि जोड़ना है या घटाना, और सही उत्तर दें।",
     "topic_hi": "कहानी वाले सवाल",
     "refs": ["Informed by NIPUN Bharat numeracy goals (Grade 2-3)"]},
]


def build() -> list[dict]:
    lessons = []
    for i, sk in enumerate(SKILLS):
        questions = sk["gen"]()
        for pos, qq in enumerate(questions):
            qq["position"] = pos
        lessons.append({
            "skill": {k: sk[k] for k in ("code", "name_en", "name_hi", "level", "grade_band")}
            | {"sort_order": i, "curriculum_refs": sk["refs"], "description_hi": sk["objective_hi"]},
            "lesson": {
                "code": f"{sk['code']}_v1",
                "title_hi": sk["name_hi"],
                "title_en": sk["name_en"],
                "objective_hi": sk["objective_hi"],
                "intro_hi": (f"नमस्ते बच्चो! मैं बोलती टोली हूँ। आज हम साथ में {sk['topic_hi']} का अभ्यास करेंगे। "
                             "मैं सवाल पूछूँगी, तुम सब मिलकर सोचो और फिर एक साथ जवाब बोलो।"),
                "completion_criteria": {"target_minutes": 15, "min_questions": 6},
                "questions": questions,
            },
        })
    return lessons


if __name__ == "__main__":
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT} with {sum(len(x['lesson']['questions']) for x in data)} questions")
