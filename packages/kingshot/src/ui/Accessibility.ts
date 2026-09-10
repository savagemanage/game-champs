import Phaser from 'phaser';

interface AccessibleControl {
  owner: Phaser.GameObjects.Container;
  element: HTMLButtonElement;
}

interface ActiveModal {
  root: Phaser.GameObjects.Container;
  previousFocus: HTMLElement | null;
  close: () => void;
  keydown: (event: KeyboardEvent) => void;
}

const controls: AccessibleControl[] = [];
let activeModal: ActiveModal | null = null;
let modalContext: HTMLElement | null = null;

/** DOM semantic mirror for Canvas controls and polite status announcements. */
export function registerAccessibleButton(
  scene: Phaser.Scene,
  owner: Phaser.GameObjects.Container,
  label: string,
  activate: () => void,
): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('a11y-controls');
  if (!root) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'canvas-control';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', activate);
  root.appendChild(button);
  const control = { owner, element: button };
  controls.push(control);
  const remove = (): void => {
    const index = controls.indexOf(control);
    if (index >= 0) controls.splice(index, 1);
    button.remove();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, remove);
  owner.once(Phaser.GameObjects.Events.DESTROY, remove);
  return button;
}

/** Whether a mirrored control belongs to the active modal and is visually live. */
export function accessibleControlVisible(owner: Phaser.GameObjects.Container): boolean {
  let visible = owner.visible && owner.active;
  let parent = owner.parentContainer;
  while (visible && parent) {
    visible = parent.visible && parent.active;
    parent = parent.parentContainer;
  }
  if (visible && activeModal) visible = isWithin(owner, activeModal.root);
  return visible;
}

/** Trap keyboard focus in a Canvas modal and restore its invoking control. */
export function openAccessibleModal(root: Phaser.GameObjects.Container, close: () => void): void {
  if (typeof document === 'undefined') return;
  if (activeModal?.root === root) return;
  if (activeModal) closeAccessibleModal(activeModal.root, false);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = modalFocusables(root);
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? current <= 0 ? focusable.length - 1 : current - 1
      : current < 0 || current >= focusable.length - 1 ? 0 : current + 1;
    event.preventDefault();
    focusable[next].focus();
  };
  activeModal = { root, previousFocus, close, keydown };
  modalContext = document.createElement('section');
  modalContext.className = 'modal-context';
  modalContext.tabIndex = 0;
  modalContext.setAttribute('aria-label', 'Dialog details');
  document.getElementById('a11y-controls')?.prepend(modalContext);
  root.once(Phaser.GameObjects.Events.DESTROY, () => closeAccessibleModal(root, false));
  document.addEventListener('keydown', keydown, true);
  const controlsRoot = document.getElementById('a11y-controls');
  controlsRoot?.classList.add('modal-open');
  controlsRoot?.setAttribute('role', 'dialog');
  controlsRoot?.setAttribute('aria-modal', 'true');
  refreshAccessibleControls();
  refreshAccessibleModalContext(root);
  queueMicrotask(() => modalFocusables(root)[0]?.focus());
}

export function closeAccessibleModal(root: Phaser.GameObjects.Container, restoreFocus = true): void {
  if (typeof document === 'undefined' || activeModal?.root !== root) return;
  const modal = activeModal;
  activeModal = null;
  document.removeEventListener('keydown', modal.keydown, true);
  const controlsRoot = document.getElementById('a11y-controls');
  controlsRoot?.classList.remove('modal-open');
  controlsRoot?.setAttribute('role', 'navigation');
  controlsRoot?.removeAttribute('aria-modal');
  modalContext?.remove();
  modalContext = null;
  refreshAccessibleControls();
  if (restoreFocus && modal.previousFocus?.isConnected && !modal.previousFocus.hidden) modal.previousFocus.focus();
}

export function refreshAccessibleControls(): void {
  for (const control of controls) control.element.hidden = !accessibleControlVisible(control.owner);
}

/** Mirror live Phaser panel copy (titles, costs, state, timers, reasons). */
export function refreshAccessibleModalContext(root: Phaser.GameObjects.Container): void {
  if (activeModal?.root !== root || !modalContext) return;
  const lines: string[] = [];
  collectVisibleText(root, lines);
  modalContext.textContent = [...new Set(lines.map((line) => line.trim()).filter(Boolean))].join('\n');
}

export function announceStatus(message: string): void {
  if (typeof document === 'undefined') return;
  const live = document.getElementById('a11y-live');
  if (live) live.textContent = message;
}

/** Stable semantic state for non-modal Canvas HUD/result content. */
export function updateAccessibleState(id: string, label: string, message: string): void {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('a11y-state');
  if (!root) return;
  let region = document.getElementById(`a11y-state-${id}`);
  if (!region) {
    region = document.createElement('section');
    region.id = `a11y-state-${id}`;
    region.setAttribute('role', 'region');
    root.appendChild(region);
  }
  region.setAttribute('aria-label', label);
  region.textContent = message;
}

export function removeAccessibleState(id: string): void {
  if (typeof document === 'undefined') return;
  document.getElementById(`a11y-state-${id}`)?.remove();
}

function modalFocusables(root: Phaser.GameObjects.Container): HTMLElement[] {
  const elements: HTMLElement[] = modalContext ? [modalContext] : [];
  elements.push(
    ...controls
      .filter((control) => isWithin(control.owner, root) && !control.element.hidden && !control.element.disabled)
      .map((control) => control.element),
  );
  return elements;
}

function collectVisibleText(container: Phaser.GameObjects.Container, lines: string[]): void {
  for (const child of container.list) {
    const candidate = child as Phaser.GameObjects.GameObject & {
      visible?: boolean;
      text?: string | string[];
      list?: Phaser.GameObjects.GameObject[];
    };
    if (candidate.visible === false) continue;
    if (typeof candidate.text === 'string') lines.push(candidate.text);
    else if (Array.isArray(candidate.text)) lines.push(candidate.text.join(' '));
    if (Array.isArray(candidate.list)) collectVisibleText(candidate as unknown as Phaser.GameObjects.Container, lines);
  }
}

function isWithin(owner: Phaser.GameObjects.Container, root: Phaser.GameObjects.Container): boolean {
  if (owner === root) return true;
  let parent = owner.parentContainer;
  while (parent) {
    if (parent === root) return true;
    parent = parent.parentContainer;
  }
  return false;
}
