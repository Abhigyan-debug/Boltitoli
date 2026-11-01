# Troubleshooting

**`TypeError: cannot use a string pattern on a bytes-like object` with PostgreSQL**
The database was created with `SQL_ASCII` encoding. Recreate it as UTF8:
`CREATE DATABASE boltitoli ENCODING 'UTF8' TEMPLATE template0;`

**API refuses to start: "Refusing to start with insecure production configuration"**
With `ENVIRONMENT=production` you must set a strong `JWT_SECRET`, a PostgreSQL `DATABASE_URL` and
`REFRESH_COOKIE_SECURE=true`. The log line `config_problem` says which.

**Logged out on every page reload**
The refresh cookie isn't being sent. Same origin: check the proxy forwards `/api/v1/auth`. Separate
origins: `REFRESH_COOKIE_SAMESITE=none`, `REFRESH_COOKIE_SECURE=true`, HTTPS on both, and
`CORS_ORIGINS` set to the exact frontend origin.

**"Speech recognition isn't available" / no "जवाब सुनें" button**
`SARVAM_API_KEY` isn't set, the provider is cooling down after errors (Settings → Voice and device),
or the device is offline. Answers can always be typed.

**Microphone permission error**
Browsers allow the microphone only on HTTPS (or `localhost`). Check site permissions in Chrome.

**No sound**
Tap **Test the speaker** on the session setup screen. With no server voice and no Hindi voice
installed on the phone, BoltiToli shows text only. On Android: Settings → Text-to-speech → install
Hindi for Google TTS. Pair the Bluetooth speaker before opening the session.

**Lesson says "Older version on this device"**
A teacher reviewed or updated the lesson. Tap **Update offline copy** while online.

**Offline session shows "sync failed"**
Tap the connectivity pill in the top bar to retry. "Not accepted" means the server rejected it (for
example, the group was deleted); the reason is shown in Sessions.

**Hero shows a flat illustration instead of 3D**
Expected on devices with ≤ 2 CPU cores, ≤ 2 GB RAM, data saver, or no WebGL. Force it with `?render=3d`
or Settings → This device.

**Playwright can't download Chromium**
Use an existing browser: `PW_CHROMIUM_PATH=/path/to/chrome npx playwright test`.

**`alembic check` reports changes**
Models changed without a migration: `alembic revision --autogenerate -m "…"`, review it, commit it.
