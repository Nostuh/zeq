# Equipment onboard — changed items report

Generated from the pre-import DB snapshot vs the post-import catalog (`eq_items` / `eq_item_bonuses` / `eq_item_covers`). **115** pre-existing items changed during the Trader’s Library bulk-load. New inserts (1715) are not listed here.

Notation: `col old→new`, `+bonus name=amt`, `bonus name old→new`, `+cover slot`. `∅` = null.

## Summary

| Category | Items |
|---|---:|
| Weapons — class/tier assigned | 23 |
| Multi — covered slots added | 5 |
| Penalties added (negative bonus) | 3 |
| Stat raised (best-of merge) | 4 |
| Bonus magnitudes filled / review cleared | 80 |
| **Total** | **115** |

## Weapons — class/tier assigned (23)

- **'Jawellyn' the bow of deadly accuracy** `[wield]` — weapon_class_value 0→1
- **A beautiful wooden violin** `[wield]` — weapon_class NULL→instrument, needs_review 1→0
- **A diamond-crested battlehammer, 'The Siphon'** `[wield]` — weapon_class NULL→bludgeon, needs_review 1→0
- **A dwarven war axe with a leather bound handle** `[wield]` — weapon_class_value 0→15
- **A huge battlehammer** `[wield]` — weapon_class NULL→bludgeon, needs_review 1→0
- **A massive club** `[wield]` — weapon_class_value 0→15
- **A masterfully crafted golden horn** `[wield]` — weapon_class NULL→instrument, needs_review 1→0
- **A venom-tipped barb** `[wield]` — weapon_class NULL→dagger, needs_review 1→0, bonus anatomy 0→4
- **A wickedly curved assassin's dagger** `[wield]` — weapon_class_value 0→5
- **An elvish war bow** `[wield]` — weapon_class_value 0→1
- **An exquisite stave of a recurve bow** `[wield]` — weapon_class NULL→bow, needs_review 1→0, weapon_class_value 0→1
- **Axe of Thunder** `[wield]` — weapon_class_value 0→15
- **Hile, the ancient warhammer of crushing** `[wield]` — weapon_class NULL→bludgeon, needs_review 1→0, weapon_class_value 0→14
- **Hule, the ancient warhammer of ice** `[wield]` — weapon_class NULL→bludgeon, needs_review 1→0, weapon_class_value 0→15
- **Jet black scythe** `[wield]` — weapon_class_value 0→5
- **Mardaukaretha sword** `[wield]` — weapon_class_value 0→11
- **Oaken staff** `[wield]` — weapon_class NULL→staff, needs_review 1→0, bonus mastery of shielding 0→2
- **Scythesong, the sibilant scimitar** `[wield]` — weapon_class NULL→sword, needs_review 1→0
- **Soulcrusher** `[wield]` — weapon_class NULL→bludgeon, needs_review 1→0
- **Sword of Thunder** `[wield]` — weapon_class_value 0→15
- **The Asklepian Rod** `[wield]` — weapon_class_value 0→5, bonus true transfer 0→5, bonus true transfer damage 0→5, bonus true distant transfer 0→5
- **The Dragon Axe** `[wield]` — weapon_class_value 0→15
- **The golden sword called 'Ffor'** `[wield]` — weapon_class_value 0→15

## Multi — covered slots added (5)

- **A black leather battlesuit called 'protector'** `[multi]` — str 30→33, bonus parry 0→2, bonus dodge 0→3, +cover arms, +cover legs, +cover torso
- **A white robe with gold linings** `[multi]` — spr 18→24, +cover arms, +cover legs, +cover torso
- **An Exoskeletal Battlesuit** `[multi]` — bonus dodge 0→4, +cover belt, +cover legs, +cover torso
- **An exquisite mithril battlesuit** `[multi]` — +cover arms, +cover legs, +cover neck, +cover torso
- **The infernal maw of Tethyl** `[multi]` — +cover head, +cover neck

## Penalties added (negative bonus) (3)

- **A large barrel-shaped helmet** `[head]` — +bonus dodge=-5
- **A two-handed sword called 'the Sentinel'** `[wield]` — +bonus parry=-5
- **Threadbare Red Plaid Shirt** `[torso]` — rfire 0→-26, bonus stunning blow 0→3

## Stat raised (best-of merge) (4)

- **A detoxifying decanter** `[held]` — hpr 0→22
- **Crown of the Ringwraith King** `[head]` — int 0→5, wis 0→3, spr 0→10
- **Silver ring with a heartshaped diamond** `[finger]` — int 3→5, wis 3→5
- **The Broadsword, Sunbringer** `[wield]` — str 0→3, dex 0→3, hpr 0→5, +bonus weapon skill 2h sword=2

## Bonus magnitudes filled / review cleared (80)

- **A blackened mithril tower shield** `[wield]` — bonus wall of steel 0→3
- **A blood-seeping tourniquet** `[belt]` — bonus mastery of medicine 0→3
- **A burnished golden chestplate** `[torso]` — bonus throw 0→3
- **A copper amplifying coil** `[neck]` — bonus tonal control 0→3, bonus tonal projection 0→3
- **A decayed yellow cloak** `[cloak]` — bonus tumble 0→2
- **A fragile hourglass of mercy** `[held]` — bonus hour of mercy 0→2
- **A heavy obsidian necklace, inlaid with diamonds** `[neck]` — bonus parry 0→1
- **A holy symbol of the ancient god of battle** `[neck]` — +bonus cure serious wounds=5
- **A jeweled dagger known as 'Annihilator'** `[wield]` — bonus triple thrust 0→1, bonus anatomy 0→1, bonus triple backstab 0→1
- **A leather belt with a solid mythril buckle** `[belt]` — bonus power blast 0→2
- **A pair of mephitic gloves** `[hands]` — bonus herb mixing 0→3
- **A pair of soft buckskin gloves** `[hands]` — bonus healing efficiency 0→1, bonus earth lore 0→1
- **A pale looking silver ring** `[finger]` — bonus tonal control 0→2
- **A pale white gemstone** `[head]` — bonus psionic efficiency 0→2, bonus art of telepathy 0→3
- **A pitchblack pelerine** `[cloak]` — bonus double backstab 0→2, bonus double thrust 0→2, bonus sneak 0→2
- **A prayer book with ivory covers** `[held]` — bonus prayer 0→3, bonus resurrect 0→3
- **A reaver's mandibles** `[head]` — bonus critical 0→3
- **A ruby necklace with a blue crystal embedded in it** `[neck]` — bonus quick chant 0→2
- **A skirt of dangling bones** `[legs]` — bonus offensive efficiency 0→4
- **A small dark grey band** `[finger]` — bonus doublehit 0→3
- **A thick fur coat** `[cloak]` — bonus ignore pain 0→1
- **A writhing signet of Teros** `[finger]` — bonus shielding of death 0→3, bonus channel power 0→3, bonus microclasm 0→3, bonus unholy ceremony 0→3
- **An ivory ring** `[finger]` — bonus harm body 0→2
- **An old human skull** `[held]` — bonus unholy power 0→3
- **An opulent golden headdress** `[head]` — bonus flow of life 0→3, bonus healing efficiency 0→3
- **Ancient wyvernscale belt** `[belt]` — bonus spot weakness 0→2
- **Band of haptic enhancement** `[finger]` — bonus pick locks 0→2
- **Beaded sash of the quickling** `[belt]` — bonus whirlwind attack 0→4, bonus doublehit 0→4
- **Black Bracelets of Domination** `[arms]` — bonus focus kungfu attacks 0→2, bonus mastery of kungfu 0→2
- **Black deerhide gloves** `[hands]` — bonus steady aim 0→2
- **Black dragonskin bracelets** `[arms]` — bonus mastery of psychokinetics 0→2, bonus psychic crush 0→2
- **Bloodred Leggings of Underworld** `[legs]` — bonus mastery of medicine 0→3
- **Blue Belt of the High Seas** `[belt]` — bonus quick chant 0→2
- **Blue steel gauntlets** `[hands]` — bonus quick chant 0→2, bonus nerve mastery 0→2
- **Blue suede shoes** `[feet]` — bonus backstab 0→2
- **Burning Black Plate** `[torso]` — bonus parry 0→2
- **Chain of Domination** `[neck]` — bonus quick chant 0→2
- **Charred Black Leggings** `[legs]` — bonus mastery of shielding 0→3
- **Ebony Telescope** `[held]` — bonus ethereal gate 0→3
- **Gem of the Gallows** `[amulet]` — bonus enhance criticals 0→3, bonus critical 0→3
- **Jadrele's wand of firebolts** `[held]` — bonus zapping 0→3
- **Leggings of Despair** `[legs]` — bonus quick chant 0→3
- **Long Blue Cloak of Vanaheim** `[cloak]` — bonus greater cold invulnerability 0→2, bonus lesser cold invulnerability 0→2
- **Magical gloves of Tower** `[hands]` — bonus quick chant 0→2
- **Mithril gauntlets with steel-spiked knuckles** `[hands]` — bonus critical 0→3
- **Old leather work gloves** `[hands]` — bonus strike 0→2
- **Ragged Straw Hat** `[head]` — bonus quick chant 0→2
- **Red bracelets of fire** `[arms]` — bonus fire preference 0→2
- **Red gloves with golden decorations** `[hands]` — bonus channel power 0→1
- **Ring of the Tower** `[finger]` — bonus essence eye 0→2
- **Shield of silver dragon scales** `[wield]` — bonus healing efficiency 0→2, bonus mastery of medicine 0→2
- **Silvery bracelets of Mana Channelling** `[arms]` — bonus offensive efficiency 0→3
- **Spider Fur Slippers** `[feet]` — bonus focus power 0→3
- **Sturdy pair of Mithril Bracelets** `[arms]` — bonus ignore pain 0→2
- **The ancient amulet of the druids** `[amulet]` — bonus mastery of medicine 0→1, bonus mastery of shielding 0→1
- **The Black Bracelets of Underworld** `[arms]` — bonus parry 0→3
- **The black cloak of silence** `[cloak]` — bonus pick locks 0→1, bonus hiding 0→2, bonus sneak 0→2
- **The black cloak of vampiric wizardy** `[cloak]` — bonus attack 0→2
- **The black crown of spiders** `[head]` — +bonus quick_chant=2
- **The black plate of Belinik** `[torso]` — bonus rage 0→3
- **The Black Robes of Kazlakhor** `[torso]` — bonus adaption of balance 0→1, bonus adaption of chaos 0→1, bonus evocation 0→1, bonus invocation 0→1, bonus adaption of order 0→1
- **The bloodstone ring of punishment** `[finger]` — bonus system shock 0→3, bonus ignore pain 0→3
- **The boots of the miles walked** `[feet]` — bonus lightsword 0→2, bonus razor edge 0→2
- **The Cane of Command** `[wield]` — bonus leadership 0→6, bonus bargain 0→6, bonus negotiate 0→6
- **The cloak of dark powers** `[cloak]` — bonus demon and devil lore 0→1, bonus soul manipulation 0→1
- **The cloak of Kk'ras'hh** `[cloak]` — bonus mastery of shielding 0→3
- **The cloak of the black circle** `[cloak]` — bonus quick chant 0→1, bonus stunning blow 0→2, bonus remove preference 0→2
- **The crimson robes of Talendine** `[torso]` — bonus healing efficiency 0→2
- **The Crown of Darkness** `[head]` — bonus asphyxiation preference 0→2, bonus poison fend 0→2, bonus poison preference 0→2, bonus venom fend 0→2
- **The Exchequer's quill** `[held]` — bonus creative accounting 0→3, bonus bargain 0→3
- **The glimmering robes of Gruumsh** `[torso]` — bonus smash 0→3, bonus holy might 0→3
- **The green boots of Greenlight** `[feet]` — bonus dodge 0→1, bonus kick placement 0→1, bonus flip kick 0→2
- **The Harbinger's Wanyugo Mask** `[head]` — bonus arcane lore 0→4
- **The leather belt of Lucifer** `[belt]` — bonus parry 0→3
- **The leggings of Dark Haven** `[legs]` — bonus quick chant 0→2
- **The Pulsing Amulet of 'Zzzzer'** `[amulet]` — bonus quick chant 0→1
- **The Shield of Dreams** `[wield]` — bonus parry 0→2
- **The steel toe boots of Lucifer** `[feet]` — bonus attack 0→2, bonus critical 0→3
- **White belt** `[belt]` — bonus stunning blow 0→2
- **Willbreaker, the whip of submission** `[wield]` — bonus dirty blow 0→5

