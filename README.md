# College Campus

**The verified network for teachers and students of every college in India.**

College Campus works like LinkedIn for Indian campuses. Students and faculty from any college build a professional profile, get verified with their college documents, and connect across institutions. They share posts, reels and stories, message each other, go live, and find placements, all in a premium navy-and-gold app that works on the web, Android and iOS.

---

## Features

| Area | What works |
|---|---|
| **Accounts** | Email + password, Google sign-in, one-tap demo, password reset by email, sign out of all devices, account deletion |
| **Profiles** | Student or faculty profile with headline, department, designation, batch, About, skills/expertise, avatar, public/private mode |
| **Verification** | Students upload an ID card, fee receipt or marksheet. Faculty upload a faculty ID or appointment letter. Admins review each document through a private, expiring link, then approve or reject |
| **Home feed** | For you / Following / Campus / Jobs tabs, photo and video carousels, likes, comments (with likes), save, share, repost with your own thoughts, hashtags, @mentions |
| **Reels** | Full-screen vertical player with swipe, double-tap like, comments, share, repost and save. You can upload your own videos or add reels from YouTube Shorts, Instagram, TikTok, Vimeo or any direct MP4 link |
| **Stories** | 24-hour photo/video stories with progress bars, views list and replies that land in DMs |
| **Messaging** | Real-time direct messages with photos, typing indicator, read receipts and unread badges |
| **Live** | Go live from the phone camera. Viewers join, chat and send hearts in real time |
| **Network** | Follow and follow requests (private accounts), block, mute a college, people suggestions, typo-tolerant search across people, colleges, posts and hashtags |
| **College hubs** | Each college has a feed, members list and notice board. Admins pin notices |
| **Placements** | Verified faculty, placement officers and recruiters post opportunities. Students apply in one tap |
| **Safety** | Report posts, reels, comments and users. Admin console with a moderation queue, verification queue, support tickets and platform stats |
| **Support** | Help centre, FAQ and support tickets with status tracking |
| **Design** | White and navy/gold theme with a dark mode, animated logo splash, skeleton loading, smooth sheets and gestures, desktop phone-frame preview |

## Tech stack

- **Web app:** React 19, Vite, Tailwind CSS, Zustand, Framer Motion
- **API:** Node.js, Express, TypeScript, SQLite (better-sqlite3), WebSocket (`ws`), JWT
- **Media:** local disk by default, or Amazon S3 + CloudFront once you add keys
- **Mobile:** Capacitor (see [build-mobile.md](build-mobile.md))

---

## Run it locally

You need **Node.js 20+**.

```bash
npm run install:all
cp server/.env.example server/.env
```

Open `server/.env` and set `DEMO_MODE=true` to get the sample campus. Then start both parts in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Open **http://localhost:5173** and tap **Try the live demo**.

### Admin console

1. Add your email to `ADMIN_EMAILS` and choose a 6-digit `ADMIN_PIN` in `server/.env`.
2. In the app, go to **Profile → Settings → Admin console** and enter the PIN.

Five wrong PINs lock the console for 30 minutes.

### Tests

```bash
cd server
npx tsx test-suite.ts http://localhost:5000
```

The suite runs end-to-end checks against a running API: auth, onboarding, verification, posts, reels, comments, follows, blocking, messaging, reports, admin access and upload validation.

---

## Connect real services

Everything works without outside services. Add these to `server/.env` when you're ready:

| Setting | Turns on |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_URL` | Media on S3 / CloudFront instead of local disk |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Password-reset emails (in development the link is printed in the server console) |
| `GOOGLE_CLIENT_ID` | "Continue with Google" |
| `ICE_SERVERS` | A TURN server, so live video works on strict mobile networks |
| `DEMO_MODE=false` | Launch mode: demo content and the demo button are removed |

The full list with explanations is in [server/.env.example](server/.env.example).

## Deploy

- **Docker (one server):** `docker compose up --build -d` builds the API and an nginx web server on port 80.
- **AWS step by step:** [deploy-aws.md](deploy-aws.md)
- **Kubernetes:** `kubectl apply -f k8s/` (secrets come from a `campus-secrets` Secret)

---

## Security

- No secrets live in the code. Everything is read from `server/.env`, which git never tracks. In production the API refuses to start with a weak `JWT_SECRET` or with a key that's known to have leaked.
- Passwords are hashed with bcrypt. Sessions are signed JWTs that can be revoked everywhere with "sign out of all devices" or a password change.
- Login, sign-up, uploads, messages and admin PIN attempts are rate-limited. Accounts lock for a while after repeated wrong passwords.
- Uploads are checked by their real file bytes (not the name), renamed randomly and size-capped.
- Verification documents are private. Only admins can open them, through links that expire within minutes.
- Strict security headers (CSP, HSTS, frame and referrer policies) and a CORS allow-list are in place. WebSocket connections authenticate after connecting, so tokens never appear in URLs or logs.
- The admin console needs both an allow-listed email and a 6-digit PIN.

## Known limits

- The database is SQLite, so run **one** API instance and back up the `data/` folder or volume. To scale to several servers, move to PostgreSQL first.
- Live video is peer-to-peer and suits up to about 20 viewers per stream. Larger audiences need a media server such as LiveKit.
- Instagram and TikTok reels play inside those platforms' own embedded players.
