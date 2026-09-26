import { useEffect, useRef } from 'react';

// Playnite ships a dedicated fullscreen mode built around full controller
// navigation, for exactly the "connect an Xbox/PlayStation controller to a TV
// from the couch" use case GOG Galaxy and Lutris' Big Picture-style modes also
// target. Playnest doesn't have (and isn't getting, in this pass) a separate
// fullscreen UI, but the normal library view already has real keyboard
// navigation — CategoryRow.tsx's onArrowNavigate moves focus between cards
// with the arrow keys, GameCard.tsx opens the focused card on Enter/Space,
// and App.tsx's document keydown handler closes modals/dialogs on Escape.
// Rather than build and maintain a second, parallel focus model for gamepads,
// this hook polls the standard Gamepad API and re-dispatches D-pad/left-stick/
// face-button input as the exact same synthetic keyboard events, so a
// controller "just works" with every keyboard interaction the app already has
// — including ones added after this hook, for free.
//
// Standard gamepad mapping (https://www.w3.org/TR/gamepad/#remapping):
//   buttons[0] = A / Cross   -> activate whatever has focus (click, like Enter)
//   buttons[1] = B / Circle  -> back/cancel (Escape)
//   buttons[12..15] = D-pad up/down/left/right
//   axes[0], axes[1] = left stick X/Y (used as a D-pad substitute)
const BUTTON_A = 0;
const BUTTON_B = 1;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;
const STICK_DEADZONE = 0.5;

// Held-direction repeat rate — fast enough to feel responsive scrolling
// through a big library, slow enough not to blow past the intended card.
// The first repeat waits a bit longer than the rest, matching how OS-level
// key-repeat (and CategoryRow's own keyboard nav) feels.
const INITIAL_REPEAT_MS = 380;
const REPEAT_MS = 140;

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

function dispatchKey(target: EventTarget, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

// If nothing focusable in the library grid currently has focus, land on the
// first visible card instead of silently doing nothing on the first press —
// otherwise a controller-only user would have no way to ever start navigating.
function focusFirstCard(): boolean {
  const first = document.querySelector<HTMLElement>('.game-card');
  if (!first) return false;
  first.focus();
  first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

interface HoldState { lastFiredAt: number; fireCount: number; }

export function useGamepadNavigation(enabled: boolean) {
  // Per-direction hold state, so the first repeat waits longer than the rest
  // (matches ordinary OS/keyboard key-repeat feel) instead of firing on a
  // fixed interval from the very first frame the direction is held.
  const holdState = useRef<Record<string, HoldState>>({});
  const wasPressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return undefined;

    let rafId: number;

    function fireDirection(name: Direction, isPressed: boolean, now: number) {
      const wasDown = wasPressed.current[name] || false;
      wasPressed.current[name] = isPressed;

      if (!isPressed) {
        delete holdState.current[name];
        return;
      }

      const state = holdState.current[name];
      let dueNow: boolean;
      if (!wasDown || !state) {
        dueNow = true;
      } else {
        const requiredGap = state.fireCount <= 1 ? INITIAL_REPEAT_MS : REPEAT_MS;
        dueNow = now - state.lastFiredAt >= requiredGap;
      }
      if (!dueNow) return;
      holdState.current[name] = { lastFiredAt: now, fireCount: (state?.fireCount || 0) + 1 };

      if (isTypingTarget(document.activeElement)) return;

      const active = document.activeElement;
      if (!active || !active.classList.contains('game-card')) {
        focusFirstCard();
        return;
      }
      dispatchKey(active, name);
    }

    function fireButton(name: 'A' | 'B', isPressed: boolean) {
      const wasDown = wasPressed.current[name] || false;
      wasPressed.current[name] = isPressed;
      if (!isPressed || wasDown) return; // edge-triggered only, no repeat — this is a "press", not "hold"
      if (isTypingTarget(document.activeElement)) return;

      if (name === 'A') {
        const active = document.activeElement as HTMLElement | null;
        // Works for a focused game-card (opens it, same as Enter) and for any
        // ordinary focused <button> in a dialog/modal (Play, Favorite, Close, a
        // status option, a collection chip) — all real DOM elements with a
        // click handler, so .click() is the one action that activates any of
        // them correctly without needing to know which one is focused.
        active?.click();
      } else {
        dispatchKey(document, 'Escape');
      }
    }

    function poll() {
      const now = performance.now();
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;

        const stickX = pad.axes[0] || 0;
        const stickY = pad.axes[1] || 0;
        fireDirection('ArrowUp', (pad.buttons[DPAD_UP]?.pressed ?? false) || stickY < -STICK_DEADZONE, now);
        fireDirection('ArrowDown', (pad.buttons[DPAD_DOWN]?.pressed ?? false) || stickY > STICK_DEADZONE, now);
        fireDirection('ArrowLeft', (pad.buttons[DPAD_LEFT]?.pressed ?? false) || stickX < -STICK_DEADZONE, now);
        fireDirection('ArrowRight', (pad.buttons[DPAD_RIGHT]?.pressed ?? false) || stickX > STICK_DEADZONE, now);
        fireButton('A', pad.buttons[BUTTON_A]?.pressed ?? false);
        fireButton('B', pad.buttons[BUTTON_B]?.pressed ?? false);

        break; // only the first connected pad drives navigation — two controllers fighting over one focus cursor would be worse than one
      }
      rafId = requestAnimationFrame(poll);
    }

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
