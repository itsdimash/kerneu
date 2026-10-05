// Блок «к выдаче» и строки истории стоят в разных местах страницы Склад и не
// знают друг о друге. После успешной выдачи первый сообщает об этом через
// событие окна, а история перечитывается.
const EVENT_NAME = "kerneu:partner-request-issued";

export function emitPartnerIssued(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onPartnerIssued(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
