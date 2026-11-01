# Configuring Claude and Sarvam

Both are optional. Keys go in `backend/.env` (or your host's secret manager). They are never sent to
the browser and never committed.

## Claude (Anthropic)

1. Create an API key in the [Claude Console](https://console.anthropic.com/).
2. Set:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL_SUMMARY=claude-sonnet-5-5     # teacher summaries, drafting questions
   ANTHROPIC_MODEL_FEEDBACK=claude-haiku-5-5     # short live explanations (4 s budget)
   ```
   Use model ids available to your account; check the [models overview](https://docs.claude.com/en/docs/about-claude/models/overview).
3. Restart the API. As an administrator, open **Settings → Voice and device** to see provider health
   after the first summary.

How it is called: `POST https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01` and
structured outputs — `output_config.format = {type: "json_schema", schema}` (every object closed with
`additionalProperties: false`) plus `effort: "low"`. The reply's text block is the JSON. See
`backend/app/ai/claude_client.py`.

Do not switch back to forced tool use: `claude-sonnet-5-5` and `claude-haiku-5-5` reject
`tool_choice: {type: "tool"}` with a 400, which silently turned every AI feature into the rule-based fallback
until 31 Oct 2026. Thinking is on by default on these models and counts toward `max_tokens`, so the client
keeps at least 4000 tokens of headroom (only tokens actually used are billed).

Live check on 31 Oct 2026 with a real key: summary (Sonnet 5.5, 5.6 s, passed the number-grounding check),
live explanation (Haiku 5.5, 2.4 s, inside the 4 s budget), question drafting (Sonnet 5.5, 5.0 s), and a full
session in the browser ending in "Written by Claude from this session's recorded answers".

## Sarvam (Hindi speech)

1. Create a subscription key at [Sarvam](https://dashboard.sarvam.ai/).
2. Set:
   ```
   SARVAM_API_KEY=...
   SARVAM_STT_MODEL=saaras:v4      # speech-to-text; keyterms bias toward Hindi number words
   SARVAM_TTS_MODEL=bulbul:v3      # text-to-speech
   SARVAM_TTS_SPEAKER=priya        # must be a valid speaker for the chosen model
   SARVAM_TTS_PACE=0.9
   ```
3. Restart the API. In **Lessons**, download a lesson again — audio clips are generated and saved for
   offline use.

Endpoints used (from Sarvam's REST docs):

| | Request | Response used |
|---|---|---|
| STT | `POST /speech-to-text`, multipart `file`, `model`, `mode=transcribe`, `keyterms` | `transcript` |
| TTS | `POST /text-to-speech`, JSON `text`, `language_code=hi-IN`, `speaker`, `model`, `pace`, `output_audio_codec=mp3` | `audios[0]` (base64) |

Header: `api-subscription-key`. Synchronous STT accepts up to 30 s; BoltiToli records at most ~7 s.

Live check on 31 Oct 2026 with a real key (`saaras:v4`, `bulbul:v3`, speaker `priya`): Bulbul spoke
"जवाब है पाँच।" (1.2 s, MP3), Saaras transcribed that audio as "जवाब है 5।" (0.7 s, `hi-IN`), and the app's
answer parser read **5**. Not yet checked: the browser's 16 kHz WAV recordings, a real microphone, and
classroom noise or chorus answers.

**Important:** Saaras does not return a confidence score. BoltiToli therefore shows what it heard and
asks the teacher or group leader to confirm before grading.

## Alternatives

`SpeechToTextService` / `TextToSpeechService` (`backend/app/speech/service.py`) are the only places
that know about Sarvam. To use AI4Bharat or another provider, add an adapter next to `sarvam.py` with
the same `transcribe()` / `synthesize()` shape and switch the service to it.

## Verifying without a classroom

```bash
cd backend
pytest tests/test_providers.py -q     # mocked HTTP: request shape, fallbacks, retries, grounding checks
```
Then run a real session from the dashboard with a phone and a Bluetooth speaker.
