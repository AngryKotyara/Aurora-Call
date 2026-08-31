# Aurora Call — Android

Android-клиент Aurora Call живёт в том же репозитории, что и веб-приложение. Интерфейс и существующая WebRTC/чат-логика загружаются с `https://aurora-call.vercel.app`, а системные возможности Android реализуются нативно.

## Что уже реализовано

- отдельное Android-приложение `app.auroracall`;
- Android 8.0+ (`minSdk 26`), compile/target SDK 36;
- защищённый WebView: только HTTPS, SSL-ошибки не обходятся, внешние URL открываются вне приложения;
- origin-aware AndroidX WebKit bridge только для `https://aurora-call.vercel.app` и только из main frame;
- системные permissions для камеры и микрофона перед выдачей WebRTC-доступа;
- выбор фото/файлов через Android file picker;
- нативная демонстрация экрана через `MediaProjection`;
- обязательный foreground service типа `mediaProjection` для современных Android;
- остановка демонстрации из системного уведомления;
- ограничение screen-share примерно до 8 FPS и 1280 px по длинной стороне для снижения нагрузки;
- deep link для `https://aurora-call.vercel.app`;
- используется та же иконка, что и у веб/PWA (`public/aurora-call-icon-512-v2.png`);
- GitHub Actions собирает debug APK при изменениях Android-кода.

## Сборка локально

Нужны JDK 17, Android SDK Platform 36, Build Tools 36.0.0 и Gradle 9.5+.

```bash
cd android
gradle :app:assembleDebug
```

APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Для release:

```bash
gradle :app:assembleRelease
```

Перед публикацией release-сборку нужно подписать собственным Android keystore. Keystore и пароли не должны храниться в Git.

## Как работает демонстрация экрана

1. Вызов существующей функции `navigator.mediaDevices.getDisplayMedia()` внутри Android-клиента перенаправляется в нативный мост.
2. Android показывает стандартное системное окно `MediaProjection`.
3. `ScreenShareService` стартует как foreground service типа `mediaProjection`.
4. Кадры снимаются через `VirtualDisplay + ImageReader`, уменьшаются до разумного разрешения и передаются обратно в main-frame WebView.
5. В WebView кадры рисуются на canvas, а `canvas.captureStream()` создаёт video track.
6. Существующий `src/calls.js` подменяет WebRTC video sender на этот track без второго PeerConnection.
7. При остановке приложение возвращается к обычному video track камеры.

## Что ещё нужно для production Android

### 1. Нативные push-уведомления

Web Push из браузерной версии нельзя считать надёжным каналом для Android WebView. Для полноценного фонового получения сообщений/входящих звонков нужно подключить FCM (или другой Android push provider), зарегистрировать Android application ID и добавить серверную регистрацию device token.

Необходимые данные для FCM нельзя безопасно выдумать или зашить без создания Android app в Firebase/Google Cloud: `project_id`, `mobilesdk_app_id`, `project_number/sender_id` и API configuration.

### 2. Входящий звонок поверх заблокированного экрана

После FCM следует добавить Android incoming-call notification с full-screen intent / call-style UI и foreground-service жизненный цикл вызова. Это позволит принимать вызовы, когда Aurora Call не открыт на экране.

### 3. Release signing и Play distribution

Нужен отдельный upload/release keystore, безопасное хранение секретов в GitHub Actions и сборка `.aab` для Google Play (если распространение пойдёт через Play).

## CI

Workflow: `.github/workflows/android-build.yml`.

Он использует JDK 17, Android SDK 36 и Gradle 9.5.0 и публикует artifact `aurora-call-android-debug`.
