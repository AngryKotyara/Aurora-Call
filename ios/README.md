# Aurora Call — iOS screen sharing

Полноэкранная демонстрация iPhone/iPad реализована через ReplayKit Broadcast Upload Extension и существующий WebRTC-звонок Aurora Call.

## Как проходит видео

1. Веб-интерфейс внутри `WKWebView` отправляет `auroraScreenShare/start`.
2. `ScreenBroadcastPicker` открывает системный ReplayKit Broadcast Picker.
3. `AuroraCallBroadcast` получает кадры полного экрана через `RPBroadcastSampleHandler`.
4. Extension ограничивает поток примерно до 12 кадров/с, масштабирует длинную сторону максимум до 1280 px и записывает последний JPEG-кадр в общий App Group.
5. Основное iOS-приложение читает новые кадры из App Group и передаёт их в JavaScript.
6. `src/ios-screen-share.js` рисует кадры на скрытый canvas и создаёт `canvas.captureStream()`.
7. `src/calls.js` заменяет текущий WebRTC video sender на этот track. Существующий микрофон и сигнализация звонка продолжают работать без второго PeerConnection.
8. После остановки ReplayKit приложение возвращает track камеры и отправляет собеседнику `screen-share: false`.

## Сборка проекта

Проект описан в `project.yml` для XcodeGen. На Mac:

```bash
cd ios
brew install xcodegen
xcodegen generate
open AuroraCall.xcodeproj
```

В Xcode выберите свою Team для обоих targets: `AuroraCall` и `AuroraCallBroadcast`.

## App Group

Оба targets должны иметь один и тот же App Group:

```text
group.app.auroracall
```

Он уже указан в обоих `.entitlements` и в `Shared/ScreenShareFiles.swift`. App Group нужно создать/разрешить для вашего Apple Developer Team в Signing & Capabilities. Если поменять identifier, поменяйте его во всех трёх местах.

## Bundle identifiers

Основное приложение:

```text
app.auroracall
```

Broadcast Upload Extension:

```text
app.auroracall.broadcast
```

Extension identifier совпадает с `ScreenBroadcastPicker.preferredExtensionBundleIdentifier`.

## Адрес веб-приложения

`AuroraCall/Info.plist` содержит `AuroraWebURL`. По умолчанию установлен:

```text
https://aurora-call.vercel.app
```

Если production Aurora Call опубликован по другому адресу, измените только `AuroraWebURL`; Swift-код менять не требуется.

## Проверка на iPhone

1. Установите подписанную сборку Aurora Call на физический iPhone.
2. Начните видеозвонок.
3. Нажмите кнопку демонстрации экрана.
4. В системном окне выберите Aurora Call Screen и нажмите Start Broadcast.
5. Кнопка станет активной после получения первого ReplayKit-кадра; собеседник должен увидеть экран вместо камеры.
6. Остановите Broadcast из системного интерфейса или повторным нажатием кнопки — Aurora Call вернёт камеру.

ReplayKit требует явного действия пользователя для запуска системной трансляции; приложение не пытается обходить это ограничение.
