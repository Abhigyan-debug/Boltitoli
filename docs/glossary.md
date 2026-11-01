# Glossary

Technical terms used in BoltiToli and its documentation, in simple words.

## Classroom terms

| Term | Meaning |
|---|---|
| **Toli (टोली)** | A group of children who practise together; the product name means "the talking group". |
| **Multigrade classroom** | One teacher teaching children of several grades or levels at the same time. |
| **Learning group** | Children at a similar level, for example Beginner, Developing or Advancing. |
| **Group leader** | A child who taps in the group's answer, recorded only as a label such as "Roll 4". |
| **Skill** | One maths ability, for example "Addition within 10". |
| **Lesson** | A fixed set of questions, hints and explanations for one skill. |
| **Right first try** | The share of questions a group answered correctly before any hint. |
| **Misconception** | A common mistake pattern, for example counting one too many. |
| **NIPUN Bharat** | India's national mission for foundational literacy and numeracy by Grade 3. |
| **SMC** | School Management Committee, which can authorise the use of a tool like BoltiToli. |
| **UDISE code** | The government's unique identification number for a school. |

## Product and architecture

| Term | Meaning |
|---|---|
| **Frontend** | The part people see in the browser: the React app. |
| **Backend** | The server that stores data and runs the logic: the FastAPI app. |
| **API** | The set of web addresses the frontend calls to read and save data, under `/api/v1`. |
| **Lesson engine** | The rule-based code that grades answers and picks the next question. |
| **PWA (progressive web app)** | A website that can be installed on a phone and work offline. |
| **Service worker** | A background script in the browser that saves files so the app works without internet. |
| **IndexedDB** | A database inside the browser, used to store lessons, audio and offline sessions. |
| **Sync** | Uploading sessions recorded offline once the internet returns, without duplicates. |
| **Idempotent** | Safe to repeat: sending the same request twice has the same effect as once. |
| **Migration** | A versioned change to the database structure, managed by Alembic. |
| **Seed** | Loading starter data, such as the lesson library, into the database. |

## AI and speech

| Term | Meaning |
|---|---|
| **Claude** | Anthropic's AI model; writes summaries and explanations and drafts questions. |
| **STT (speech to text)** | Turning spoken words into text; Sarvam Saaras does this. |
| **TTS (text to speech)** | Turning text into spoken audio; Sarvam Bulbul does this. |
| **Structured output** | Asking an AI to reply in an exact JSON format that code can rely on. |
| **Grounding check** | Rejecting an AI summary if it mentions numbers not found in the session data. |
| **Fallback** | The simpler behaviour used when a provider is unavailable, such as a rule-based summary. |
| **Circuit breaker** | Stops calling a failing service for a while so the app stays fast. |
| **API key** | A secret password that lets the backend use a paid service. |

## Security and operations

| Term | Meaning |
|---|---|
| **JWT** | A signed login token that proves who you are on each request. |
| **Refresh token** | A longer-lived cookie used to get new login tokens; it rotates on every use. |
| **bcrypt** | A slow, salted way of storing passwords so they cannot be read back. |
| **Rate limit** | A cap on how often one visitor can call an endpoint, to prevent abuse and cost. |
| **X-Forwarded-For** | A header in which proxies pass along the visitor's real address. |
| **CORS** | Browser rules about which websites may call the API. |
| **Environment variable** | A setting given to the app from outside the code, for example in `.env`. |
| **Docker / container** | A packaged app with everything it needs, running the same way everywhere. |
| **CI (continuous integration)** | Automatic tests that run on every change, here in GitHub Actions. |

## Interface and design

| Term | Meaning |
|---|---|
| **i18n** | Internationalisation: building the app so its text can switch languages. |
| **Design token** | A named design value, such as a colour, used everywhere so it can be changed in one place. |
| **WebGL** | The browser feature that draws 3D graphics. |
| **Error boundary** | A React component that catches a crash in its children and shows a fallback. |
| **Reduced motion** | A device setting asking apps to minimise animation; BoltiToli respects it. |
| **Accessibility (a11y)** | Making the app usable for everyone, including screen-reader and keyboard users. |
| **axe** | An automated accessibility checker used in the end-to-end tests. |
