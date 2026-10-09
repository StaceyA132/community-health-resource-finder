// Only allow http(s) links so a bad database row can't inject a `javascript:` URL.
export function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
