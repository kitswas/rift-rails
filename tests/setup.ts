const matchMediaStub = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

Object.defineProperty(globalThis, "matchMedia", {
  value: matchMediaStub,
  writable: true,
  configurable: true,
});
