# Aurora Call — Android

Android-клиент Aurora Call живёт в том же репозитории, что и веб-приложение. Интерфейс и существующая WebRTC/чат-логика загружаются с `https://aurora-call.vercel.app`, а системные возможности Android реализуются нативно.

## Архитектура без Google

Android 1.2+ не использует Firebase Cloud Messaging, Google Services plugin или Google STUN. Фоновые уведомления работают через UnifiedPush, production distributor планируется на собственном ntfy-сервере `https://push.auroracall.net`, а STUN/TURN — на `turn.auroracall.net`.

Push payload от Aurora backend до приложения шифруется стандартным Web Push шифрованием. ntfy получает и транспортирует зашифрованный payload, а расшифровка выполняется UnifiedPush connector внутри процесса Aurora Call.

## Реализовано

- application ID `app.auroracall`, Android 8.0+ (`minSdk 26`), compile/target SDK 36;
- защищённый WebView: только HTTPS, SSL-ошибки не обходятся, внешние URL открываются вне приложения;
- origin-aware AndroidX WebKit bridge только для production origin и main frame;
- системные permissions камеры/микрофона перед WebRTC-доступом;
- Android file picker;
- нативная демонстрация экрана через `MediaProjection`;
- foreground services для screen share и активного звонка;
- UnifiedPush connector 3.3.5 вместо FCM;
- encrypted Web Push endpoint с VAPID/p256dh/auth;
- привязка push endpoint к текущей сессии и автоматическое истечение вместе с сессией;
- удаление push-привязки при logout;
- системное входящее уведомление «Ответить/Отклонить»;
- full-screen incoming-call UI для заблокированного устройства;
- `call_end` закрывает устаревший входящий звонок;
- deep links;
- общая иконка с веб/PWA;
- debug и release CI.

## Debug-сборка

```bash
cd android
gradle :app:assembleDebug
```

APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Debug application ID — `app.auroracall.debug`.

## UnifiedPush

Aurora Call является UnifiedPush application. Для получения push на устройстве должен быть установлен distributor. Для полностью Google-free конфигурации используется ntfy Android из F-Droid/direct release, настроенный на собственный сервер `https://push.auroracall.net`.

Self-hosted конфигурация сервера находится в `infra/ntfy/`.

## Release signing

Workflow `.github/workflows/android-release.yml` собирает подписанные APK и AAB вручную через `workflow_dispatch`.

Нужны только secrets подписи:

```text
AURORA_KEYSTORE_B64
AURORA_KEYSTORE_PASSWORD
AURORA_KEY_ALIAS
AURORA_KEY_PASSWORD
```

Никаких Firebase/Google credentials release workflow не требует.

## TURN/STUN

Google STUN удалён. Базовая конфигурация использует `stun:turn.auroracall.net:3478`. Production coturn stack находится в `infra/coturn/`.

Для relay используются короткоживущие TURN REST credentials на основе HMAC shared secret. Постоянный TURN пароль нельзя помещать в клиентский JavaScript.

До фактического запуска `turn.auroracall.net` WebRTC сможет использовать только локальные/direct ICE candidates; надёжная работа между сложными NAT/CGNAT сетями требует работающего coturn.

## Демонстрация экрана

1. `navigator.mediaDevices.getDisplayMedia()` перенаправляется в нативный Android bridge.
2. Android показывает системное разрешение `MediaProjection`.
3. `ScreenShareService` запускается как foreground service.
4. `VirtualDisplay + ImageReader` создают кадры, которые ограничиваются по разрешению/FPS.
5. Кадры передаются в main-frame WebView и превращаются в video track через canvas capture stream.
6. Существующий WebRTC sender заменяет camera track на screen track без второго PeerConnection.
7. После остановки возвращается camera track.

## CI

- `.github/workflows/android-build.yml` — debug APK;
- `.github/workflows/android-release.yml` — подписанные release APK/AAB;
- общий `Security and build` — тесты, Prettier, `npm audit --audit-level=high`, production web-build;
- CodeQL — статический security analysis.
