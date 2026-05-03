// ============================================
// LOADER — orchestrates katana rise + slash
// ============================================

import { initKatana, triggerSlash, getSpinProgress } from './katana.js';

export function initLoader(onComplete) {
  // Init Three.js katana scene
  initKatana();

  // Watch sword progress — fire the slash the moment it reaches its final position.
  let _slashTriggered = false;

  const watchSword = () => {
    if (getSpinProgress() >= 1 && !_slashTriggered) {
      _slashTriggered = true;
      gsap.ticker.remove(watchSword);
      triggerSlash(onComplete);
    }
  };

  gsap.ticker.add(watchSword);
}
