# Fix: Android Build Failing on Emergent

The logs show it is the **Android app build** that fails, not the server deploy. The build stops while preparing the Android project because the splash-screen image file is missing. This plan fixes that and the build warnings found in the same log, so APK / Play Store builds go through again.

## Who it's for
- The app owner, who needs a working Android build to test voice, GPS and photos on real phones and share the APK.
- Pharmacies, distributors and staff installing the Android app.

## What the logs say

**The error that stops the build:**
- `ENOENT: no such file or directory, open './assets/images/splash-icon.png'`
- The app settings point to a splash image that doesn't exist in the project, so Android project preparation stops right there.

**Warnings from the same check (they don't stop the build today, but get fixed too):**
1. **Colours written in short form:** the app settings use `#000` for the status bar and app icon background. The build expects the full form, `#000000`.
2. **Icons not square:** `icon.png` and `adaptive-icon.png` are 512×513 pixels instead of 512×512.
3. **Missing helper package:** the voice-recording package added in the retailer update needs a companion package (`expo-asset`) that isn't installed. Without it the app can crash on real phones.
4. **Navigation library installed twice:** two copies exist at different versions, which can cause build errors.
5. **Three Expo packages a little out of date:** `expo`, `expo-constants` and `expo-file-system`, by small patch versions.

## Fixes
- **Splash image:** add a splash image at the expected location. It uses the existing app icon on a plain background, so nothing new needs designing.
- **Colours:** change `#000` to `#000000` in the app settings.
- **Icons:** make both icon images exactly square (512×512), keeping the same picture.
- **Helper package:** install `expo-asset` at the version that matches the Expo version.
- **Duplicate navigation library:** remove the duplicate so the app uses a single, matching version.
- **Patch updates:** bring the three Expo packages to the versions the build checker expects.
- **No other changes:** app features, screens and server code stay as they are.

## User flow
1. The fixes above are applied.
2. The preview app is checked so it still opens and works.
3. The deployment health check runs to confirm nothing else would block the build.
4. The user generates the Android build again from Publish on Emergent.
5. If the build fails again, the new log is read and fixed the same way.

## UI/UX feel
- No visible change inside the app.
- The launch (splash) screen shows the app icon on a dark background, matching the current colours.

## Implementation phases
- **Phase 1 (now, MVP):** add the splash image, fix the colours and icon sizes, add the missing package, remove the duplicate, apply the patch updates, re-check, and the user rebuilds the Android app.
- **Phase 2:** confirm the iOS build passes the same checks before the first iOS build.
- **Phase 3:** a short pre-build checklist (images present, colours valid, packages matched), run before each future build.

## Assumptions
- The failure is the Android app build: the log is an EAS Android build that failed at "Prebuild". Server deploy is not the problem.
- The splash image reuses the existing app icon on a black (`#000000`) background. Black is already the configured splash colour.
- Squaring the icons removes one row of pixels. The icon looks the same.
- Package updates stay within the current Expo version, so nothing breaks.
- The user starts the new build; it can't be triggered from here.
