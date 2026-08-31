# Aurora Call — Android

Android-клиент Aurora Call живёт в том же репозитории, что и веб-приложение. Интерфейс и существующая WebRTC/чат-логика загружаются с `https://aurora-call.vercel.app`, а системные возможности Android реализуются нативно.

## Реализовано

- отдельное Android-приложение `app.auroracall`;
- Android 8.0+ (`minSdk 26`), compile/target SDK 36;
- защищённый WebView: только HTTPS, SSL-ошибки не обходятся, внешние URL открываются вне приложения;
- origin-aware AndroidX WebKit bridge только для `https://aurora-call.vercel.app` и только из main frame;
- системные permissions для камеры и микрофона перед выдачей WebRTC-доступа;
- выбор фото/файлов через Android file picker;
- нативная демонстрация экрана через `MediaProjection`;
- foreground service типа `mediaProjection` для современных Android;
- остановка демонстрации из системного уведомления;
- ограничение screen-share примерно до 8 FPS и 1280 px по длинной стороне для снижения нагрузки;
- FCM-клиент для фоновых сообщений и входящих звонков;
- серверная привязка FCM device token к текущей сессии Aurora Call;
- автоматическое истечение Android push-регистрации вместе с сессией;
- удаление push-привязки перед выходом из аккаунта;
- системное уведомление входящего звонка с действиями «Ответить» и «Отклонить»;
- полноэкранный incoming-call UI для заблокированного устройства;
- foreground service активного аудио/видеозвонка;
- закрытие устаревшего системного уведомления при завершении звонка;
- deep link для `https://aurora-call.vercel.app`;
- используется та же иконка, что и у веб/PWA (`public/aurora-call-icon-512-v2.png`);
- CI для debug APK и отдельный workflow для подписанных release APK/AAB.

## Debug-сборка

Нужны JDK 17, Android SDK Platform 36, Build Tools 36.0.0 и Gradle 9.5+.

```bash
cd android
gradle :app:assembleDebug
```

APK создаётся здесь:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Debug-вариант использует application ID `app.auroracall.debug`. Чтобы проверять FCM именно в debug APK, в Firebase должен существовать Android app с этим application ID и соответствующий `android/app/google-services.json`.

## Production FCM

Release application ID: `app.auroracall`.

Для включения фоновых push-уведомлений нужно создать Android app `app.auroracall` в Firebase, скачать `google-services.json` и настроить серверную service account для Firebase Cloud Messaging HTTP v1.

`google-services.json` не коммитится в репозиторий. Для GitHub Actions его содержимое в Base64 хранится в secret:

```text
AURORA_FIREBASE_GOOGLE_SERVICES_B64
```

Сервер `aurora-push` ожидает service account JSON в закрытой конфигурации Supabase под ключом:

```text
firebase_service_account_json
```

Ни Firebase service account, ни `google-services.json` нельзя публиковать в Git.

## Release signing

Workflow `.github/workflows/android-release.yml` собирает подписанные APK и AAB вручную через `workflow_dispatch`.

Необходимые GitHub Actions Secrets:

```text
AURORA_FIREBASE_GOOGLE_SERVICES_B64
AURORA_KEYSTORE_B64
AURORA_KEYSTORE_PASSWORD
AURORA_KEY_ALIAS
AURORA_KEY_PASSWORD
```

Workflow декодирует Firebase config и keystore только на временном GitHub Actions runner, затем собирает:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

## Как работает демонстрация экрана

1. Вызов `navigator.mediaDevices.getDisplayMedia()` внутри Android-клиента перенаправляется в нативный мост.
2. Android показывает стандартное системное окно `MediaProjection`.
3. `ScreenShareService` стартует как foreground service типа `mediaProjection`.
4. Кадры снимаются через `VirtualDisplay + ImageReader`, уменьшаются до разумного разрешения и передаются обратно в main-frame WebView.
5. В WebView кадры рисуются на canvas, а `canvas.captureStream()` создаёт video track.
6. `src/calls.js` подменяет WebRTC video sender на этот track без второго PeerConnection.
7. При остановке приложение возвращается к обычному video track камеры.

## Надёжность звонков

Клиентская логика звонков, foreground lifecycle и системный incoming-call UI реализованы. Для гарантированного установления WebRTC-соединения в сложных мобильных, корпоративных и CGNAT-сетях production-конфигурации также нужен TURN-сервер. Один STUN не гарантирует соединение для всех пар сетей.

## CI

- `.github/workflows/android-build.yml` — debug APK на каждое изменение Android-кода;
- `.github/workflows/android-release.yml` — подписанные release APK/AAB после добавления production secrets;
- общий `Security and build` workflow проверяет тесты, форматирование, `npm audit --audit-level=high` и production web-build.
