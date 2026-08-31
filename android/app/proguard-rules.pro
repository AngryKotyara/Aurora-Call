# Aurora Call Android release rules.
# Keep WebView-related callbacks and service listener names stable for conservative R8 builds.
-keep class app.auroracall.MainActivity { *; }
-keep class app.auroracall.ScreenShareService { *; }
