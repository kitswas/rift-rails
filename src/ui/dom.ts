// Shared DOM lookup helpers for UI modules.
export function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}
export function btn(id: string): HTMLButtonElement | null {
  return document.getElementById(id) as HTMLButtonElement | null;
}
