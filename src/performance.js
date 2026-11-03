// Enable the lighter visual treatment when the device reports limited resources.
function updatePerformanceMode() {
  const connection = navigator.connection;
  const limitedMemory = Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2;
  const limitedCores = Number(navigator.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 4;
  document.documentElement.classList.toggle('performance-lite', Boolean(limitedMemory || limitedCores || connection?.saveData));
}
updatePerformanceMode();
navigator.connection?.addEventListener?.('change', updatePerformanceMode);
