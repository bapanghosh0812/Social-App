# Building the Android and iOS apps

The mobile apps are the same React web app wrapped with [Capacitor](https://capacitorjs.com). Inside the app the web files load from the phone itself. Because of that, the app has to know where your API lives.

## 1. Point the app at your API

Create `client/.env.production`. It's git-ignored.

```ini
VITE_API_ORIGIN=https://api.yourdomain.in
```

On the server, make sure `CORS_ORIGINS` in `server/.env` includes the app origins:

```ini
CORS_ORIGINS=https://app.yourdomain.in,capacitor://localhost,https://localhost
```

## 2. Android (APK / AAB)

You need Node.js 20+, Android Studio and JDK 17.

```bash
npm install --prefix client
npm run build --prefix client
npm install -D @capacitor/cli @capacitor/core @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

In Android Studio:
- **Build → Build Bundle(s) / APK(s) → Build APK(s)** gives you a test APK.
- **Build → Generate Signed Bundle** gives you the AAB for the Play Store.

Keep your signing keystore out of git. `.gitignore` already skips `*.jks` and `*.keystore`.

## 3. iOS (Mac + Xcode)

```bash
npm install -D @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

In Xcode, pick your team, then **Product → Archive** to upload to App Store Connect.

After every web change, run `npm run build --prefix client` and then `npx cap sync`.
