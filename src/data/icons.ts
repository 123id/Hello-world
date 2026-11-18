// GENERATED from public/icons/manifest.json — maps library card ids to icon files in /public/icons.
export const ICON_FILES: Record<string, string> = {
  'heroes:aegion-brightsteel': 'icons/heroes-aegion-brightsteel.png',
  'heroes:alleria-and-wildfang': 'icons/heroes-alleria-and-wildfang.png',
  'heroes:alric': 'icons/heroes-alric.png',
  'heroes:ashbite': 'icons/heroes-ashbite.png',
  'heroes:asra': 'icons/heroes-asra.png',
  'heroes:beresad': 'icons/heroes-beresad.png',
  'heroes:bonehart': 'icons/heroes-bonehart.png',
  'heroes:dierdre': 'icons/heroes-dierdre.png',
  'heroes:drakkan': 'icons/heroes-drakkan.png',
  'heroes:eiskalt': 'icons/heroes-eiskalt.png',
  'heroes:hacksaw': 'icons/heroes-hacksaw.png',
  'heroes:ingvar-bearclaw': 'icons/heroes-ingvar-bearclaw.png',
  'heroes:king-malik': 'icons/heroes-king-malik.png',
  'heroes:lord-veznan': 'icons/heroes-lord-veznan.png',
  'heroes:magnus-spellbane': 'icons/heroes-magnus-spellbane.png',
  'heroes:phoenix': 'icons/heroes-phoenix.png',
  'heroes:raelyn': 'icons/heroes-raelyn.png',
  'heroes:vesper': 'icons/heroes-vesper.png',
  'heroes:wrath-of-blackburn': 'icons/heroes-wrath-of-blackburn.png',
  'spells:cursed-vines': 'icons/spells-cursed-vines.png',
  'spells:fallen-order': 'icons/spells-fallen-order.png',
  'spells:polymorph': 'icons/spells-polymorph.png',
  'spells:rain-of-fire': 'icons/spells-rain-of-fire.png',
  'spells:reinforcements': 'icons/spells-reinforcements.png',
  'spells:solar-blast': 'icons/spells-solar-blast.png',
  'spells:swarm-of-locusts': 'icons/spells-swarm-of-locusts.png',
  'spells:teleport': 'icons/spells-teleport.png',
  'spells:thunderbolt': 'icons/spells-thunderbolt.png',
  'spells:ultimate-strike': 'icons/spells-ultimate-strike.png',
  'towers:arcane-wizard': 'icons/towers-arcane-wizard.png',
  'towers:assassins': 'icons/towers-assassins.png',
  'towers:battle-mecha': 'icons/towers-battle-mecha.png',
  'towers:blazing-gem': 'icons/towers-blazing-gem.png',
  'towers:crimson-manor': 'icons/towers-crimson-manor.png',
  'towers:cursed-altar': 'icons/towers-cursed-altar.png',
  'towers:denas-bastion': 'icons/towers-denas-bastion.png',
  'towers:elephant-stompguard': 'icons/towers-elephant-stompguard.png',
  'towers:holy-sanctuary': 'icons/towers-holy-sanctuary.png',
  'towers:musketeer-garrison': 'icons/towers-musketeer-garrison.png',
  'towers:sandworm-hollow': 'icons/towers-sandworm-hollow.png',
  'towers:twilight-longbow': 'icons/towers-twilight-longbow.png',
  'towers:vampires': 'icons/towers-crimson-manor.png',
  'towers:witches-coven': 'icons/towers-witches-coven.png',
}

export type CardKind = 'towers' | 'heroes' | 'spells'

/** URL of a card's icon, or null when we don't have one yet. */
export const iconUrl = (kind: CardKind, id: string): string | null => {
  const f = ICON_FILES[`${kind}:${id}`]
  return f ? `${import.meta.env.BASE_URL}${f}` : null
}
