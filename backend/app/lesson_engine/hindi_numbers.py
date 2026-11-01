"""Parse a spoken or typed answer into a number.

Handles ASCII digits, Devanagari digits, Hindi number words 0-100 (with common
spelling variants), and romanised Hindi / English words that speech-to-text
systems sometimes return for code-mixed speech.

The parser is deliberately conservative: if an utterance contains two
*different* numbers (e.g. "तीन ... नहीं पाँच") it is reported as ambiguous
instead of guessing. Repeated identical numbers ("पाँच पाँच पाँच" from a group
chorus) are fine.

Keep in sync with frontend/src/features/sessions/engine/hindiNumbers.ts.
Both are tested against shared/engine-fixtures.json.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

_HINDI_WORDS: dict[int, list[str]] = {
    0: ["शून्य", "जीरो", "ज़ीरो"],
    1: ["एक"], 2: ["दो"], 3: ["तीन"], 4: ["चार"], 5: ["पांच", "पाँच"],
    6: ["छह", "छः", "छे", "छै", "छ"], 7: ["सात"], 8: ["आठ"], 9: ["नौ"], 10: ["दस"],
    11: ["ग्यारह"], 12: ["बारह"], 13: ["तेरह"], 14: ["चौदह"], 15: ["पंद्रह", "पन्द्रह"],
    16: ["सोलह"], 17: ["सत्रह"], 18: ["अठारह", "अट्ठारह"], 19: ["उन्नीस"], 20: ["बीस"],
    21: ["इक्कीस"], 22: ["बाईस"], 23: ["तेईस"], 24: ["चौबीस"], 25: ["पच्चीस"],
    26: ["छब्बीस"], 27: ["सत्ताईस"], 28: ["अट्ठाईस", "अठ्ठाईस", "अठाईस"], 29: ["उनतीस", "उन्तीस"],
    30: ["तीस"], 31: ["इकतीस", "इकत्तीस"], 32: ["बत्तीस"], 33: ["तैंतीस", "तेतीस"],
    34: ["चौंतीस", "चौतीस"], 35: ["पैंतीस", "पैतीस"], 36: ["छत्तीस"], 37: ["सैंतीस", "सैतीस"],
    38: ["अड़तीस", "अडतीस"], 39: ["उनतालीस", "उन्तालीस"], 40: ["चालीस"],
    41: ["इकतालीस"], 42: ["बयालीस", "बियालीस"], 43: ["तैंतालीस", "तेतालीस"], 44: ["चवालीस", "चौवालीस"],
    45: ["पैंतालीस", "पैतालीस"], 46: ["छियालीस"], 47: ["सैंतालीस", "सैतालीस"], 48: ["अड़तालीस", "अडतालीस"],
    49: ["उनचास"], 50: ["पचास"], 51: ["इक्यावन"], 52: ["बावन"], 53: ["तिरपन", "तिरेपन"],
    54: ["चौवन", "चव्वन"], 55: ["पचपन"], 56: ["छप्पन"], 57: ["सत्तावन"], 58: ["अट्ठावन", "अठावन"],
    59: ["उनसठ"], 60: ["साठ"], 61: ["इकसठ"], 62: ["बासठ"], 63: ["तिरसठ", "तिरेसठ"], 64: ["चौंसठ", "चौसठ"],
    65: ["पैंसठ", "पैसठ"], 66: ["छियासठ"], 67: ["सड़सठ", "सरसठ"], 68: ["अड़सठ"], 69: ["उनहत्तर"],
    70: ["सत्तर"], 71: ["इकहत्तर"], 72: ["बहत्तर"], 73: ["तिहत्तर"], 74: ["चौहत्तर"], 75: ["पचहत्तर"],
    76: ["छिहत्तर"], 77: ["सतहत्तर"], 78: ["अठहत्तर"], 79: ["उनासी", "उन्यासी"], 80: ["अस्सी"],
    81: ["इक्यासी"], 82: ["बयासी"], 83: ["तिरासी"], 84: ["चौरासी"], 85: ["पचासी"], 86: ["छियासी"],
    87: ["सत्तासी"], 88: ["अट्ठासी"], 89: ["नवासी"], 90: ["नब्बे"], 91: ["इक्यानवे"], 92: ["बानवे"],
    93: ["तिरानवे"], 94: ["चौरानवे"], 95: ["पचानवे"], 96: ["छियानवे"], 97: ["सत्तानवे"],
    98: ["अट्ठानवे"], 99: ["निन्यानवे"], 100: ["सौ", "एक सौ"],
}

_ROMAN_WORDS: dict[int, list[str]] = {
    0: ["zero", "shunya"], 1: ["ek", "one"], 2: ["do", "two"], 3: ["teen", "three"],
    4: ["char", "chaar", "four"], 5: ["paanch", "panch", "five"], 6: ["chhah", "chhe", "six"],
    7: ["saat", "seven"], 8: ["aath", "eight"], 9: ["nau", "nine"], 10: ["das", "ten"],
    11: ["gyarah", "eleven"], 12: ["barah", "baarah", "twelve"], 13: ["terah", "thirteen"],
    14: ["chaudah", "fourteen"], 15: ["pandrah", "fifteen"], 16: ["solah", "sixteen"],
    17: ["satrah", "seventeen"], 18: ["atharah", "eighteen"], 19: ["unnis", "unnees", "nineteen"],
    20: ["bees", "twenty"], 30: ["tees", "thirty"], 40: ["chalis", "chaalis", "forty"],
    50: ["pachas", "pachaas", "fifty"], 60: ["saath", "sixty"], 70: ["sattar", "seventy"],
    80: ["assi", "eighty"], 90: ["nabbe", "ninety"], 100: ["sau", "hundred"],
}

_DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _norm(text: str) -> str:
    t = unicodedata.normalize("NFC", text)
    t = t.replace("़", "")  # nukta
    t = t.replace("ँ", "ं")  # chandrabindu -> anusvara
    return t.lower()


_LOOKUP: dict[str, int] = {}
for _n, _words in _HINDI_WORDS.items():
    for _w in _words:
        _LOOKUP[_norm(_w)] = _n
for _n, _words in _ROMAN_WORDS.items():
    for _w in _words:
        _LOOKUP.setdefault(_norm(_w), _n)

# Words that must not be read as numbers even though they collide ("do" as in
# "do it" is too risky in English, but in Hindi STT output "दो" is two). We only
# treat the romanised "do" as two when the utterance has no other English words.
_ENGLISH_HINTS = {"it", "the", "is", "a", "and", "you", "please", "answer"}

_TOKEN_RE = re.compile(r"[0-9]+|[^\s0-9.,!?।|\-:;\"'()]+")


@dataclass(frozen=True)
class ParsedAnswer:
    value: int | None
    status: str  # "ok" | "empty" | "ambiguous" | "not_a_number"
    candidates: tuple[int, ...] = ()


def parse_answer(text: str | None) -> ParsedAnswer:
    if text is None or not text.strip():
        return ParsedAnswer(None, "empty")
    norm = _norm(text).translate(_DEV_DIGITS)
    tokens = _TOKEN_RE.findall(norm)
    english_context = any(t in _ENGLISH_HINTS for t in tokens)

    found: list[int] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        # two-token phrase first ("एक सौ")
        if i + 1 < len(tokens):
            pair = f"{tok} {tokens[i + 1]}"
            if pair in _LOOKUP:
                found.append(_LOOKUP[pair])
                i += 2
                continue
        if tok.isdigit():
            found.append(int(tok))
        elif tok in _LOOKUP and not (tok == "do" and english_context):
            found.append(_LOOKUP[tok])
        i += 1

    distinct = tuple(dict.fromkeys(found))
    if not distinct:
        return ParsedAnswer(None, "not_a_number")
    if len(distinct) > 1:
        return ParsedAnswer(None, "ambiguous", distinct)
    return ParsedAnswer(distinct[0], "ok", distinct)


def number_to_hindi(n: int) -> str:
    words = _HINDI_WORDS.get(n)
    return words[0] if words else str(n)


def stt_keyterms(max_value: int = 20) -> list[str]:
    """Number words to bias STT recognition (Sarvam saaras:v4 `keyterms`, max 50)."""
    terms: list[str] = []
    for n in range(0, max_value + 1):
        terms.append(_HINDI_WORDS[n][0])
    return terms[:50]
