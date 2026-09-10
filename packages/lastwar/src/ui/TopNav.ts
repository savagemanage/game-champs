import Phaser from 'phaser';
import { CANVAS, PALETTE, SceneKeys } from '../config/GameConfig';
import { NAV_ICON_FRAME, TextureKeys, type NavIconName } from '../config/AssetKeys';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { textStyle } from './UiText';
import { Menu } from './Menu';

const TABS: readonly { icon: NavIconName; label: TrKey; scene: string }[] = [
  { icon: 'base', label: 'nav.base', scene: SceneKeys.Base },
  { icon: 'heroes', label: 'nav.heroes', scene: SceneKeys.Heroes },
  { icon: 'campaign', label: 'nav.campaign', scene: SceneKeys.Campaign },
  { icon: 'missions', label: 'nav.missions', scene: SceneKeys.Missions },
  { icon: 'season', label: 'nav.season', scene: SceneKeys.Season },
  { icon: 'falcon', label: 'nav.falcon', scene: SceneKeys.Run },
];

/** Persistent top-level navigation used on Home/Base/Heroes/Campaign/Missions/Season. */
export function buildTopNav(scene: Phaser.Scene, activeScene: string): void {
  const height = 76;
  const y = CANVAS.HEIGHT - height / 2;
  scene.add.image(CANVAS.WIDTH / 2, y, TextureKeys.UiTabBar).setDisplaySize(CANVAS.WIDTH, height).setDepth(150);
  const width = CANVAS.WIDTH / TABS.length;
  TABS.forEach((tab, index) => {
    const x = index * width + width / 2;
    const active = tab.scene === activeScene;
    scene.add.image(x, y - 12, TextureKeys.NavIcons, NAV_ICON_FRAME[tab.icon]).setScale(1.35).setTint(active ? PALETTE.SQUAD : 0xffffff).setDepth(151);
    scene.add.text(x, y + 20, tr(tab.label), textStyle(10, { align: 'center', color: active ? PALETTE.SQUAD_CSS : PALETTE.TEXT_CSS, allowSmall: true })).setOrigin(0.5).setDepth(151);
    const zone = scene.add.zone(x, y, width, height).setInteractive({ useHandCursor: true }).setDepth(152);
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (active) return;
      Menu.fadeTo(scene, () => scene.scene.start(tab.scene, { returnTo: SceneKeys.Home }));
    });
  });
}
