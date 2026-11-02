/**
 * Keeps the last few error messages of this session in memory so that « Signaler un problème »
 * can attach them. Nothing is sent anywhere until the user presses « Envoyer ».
 */
const MAX = 5;
const MAX_LEN = 300;
const buffer: { at: string; message: string }[] = [];

export function recordClientError(reason: unknown) {
  let message = "";
  if (reason instanceof Error) message = `${reason.name}: ${reason.message}`;
  else if (typeof reason === "string") message = reason;
  else if (reason && typeof (reason as { message?: unknown }).message === "string") {
    message = String((reason as { message: string }).message);
  } else return;
  message = message.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  if (!message) return;
  buffer.push({ at: new Date().toISOString(), message });
  if (buffer.length > MAX) buffer.shift();
}

export function recentClientErrors() {
  return [...buffer];
}
