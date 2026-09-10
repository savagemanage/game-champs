/** Lightweight accessible DOM mirror for the canvas UI. */
export function setAccessibleScreen(title: string, summary = ''): void {
  if (typeof document === 'undefined') return;
  const heading = document.getElementById('a11y-title');
  const status = document.getElementById('a11y-status');
  if (heading) heading.textContent = title;
  if (status) status.textContent = summary;
}

export function announce(message: string): void {
  if (typeof document === 'undefined') return;
  const live = document.getElementById('a11y-live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => { live.textContent = message; }, 0);
}

export function addAccessibleButton(label: string, activate: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const host = document.getElementById('a11y-controls');
  if (!host) return () => undefined;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', activate);
  host.appendChild(button);
  return () => button.remove();
}
