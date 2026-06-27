# Onboard progress

Where the equipment bulk-load stands, per slot. Phases (see
[README.md](README.md) runbook): **list** = `list <slot>` pasted into
`lists/`; **cmds** = `commands/<slot>.txt` generated; **data** = `lookup`
output collected into `armour/`·`weapons/`; **import** = `--apply`'d.
Update this as we go.

Legend: ☑ done · ☐ todo

## Armour
| slot   | list | cmds | data | import |
|--------|:----:|:----:|:----:|:------:|
| amulet |  ☑   |  ☑ (82) |  ☐   |   ☐    |
| arms   |  ☐   |  ☐   |  ☐   |   ☐    |
| belt   |  ☐   |  ☐   |  ☐   |   ☐    |
| cloak  |  ☐   |  ☐   |  ☐   |   ☐    |
| feet   |  ☐   |  ☐   |  ☐   |   ☐    |
| finger |  ☐   |  ☐   |  ☐   |   ☐    |
| hands  |  ☐   |  ☐   |  ☐   |   ☐    |
| head   |  ☐   |  ☐   |  ☐   |   ☐    |
| held   |  ☐   |  ☐   |  ☐   |   ☐    |
| legs   |  ☐   |  ☐   |  ☐   |   ☐    |
| multi  |  ☐   |  ☐   |  ☐   |   ☐    |
| neck   |  ☐   |  ☐   |  ☐   |   ☐    |
| shield |  ☐   |  ☐   |  ☐   |   ☐    |
| torso  |  ☐   |  ☐   |  ☐   |   ☐    |

## Weapons
| slot          | list | cmds | data | import |
|---------------|:----:|:----:|:----:|:------:|
| 1h_sword      |  ☑   |  ☑ (101) |  ☑   |   ☐    |
| 1h_ancient    |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_axe        |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_bludgeon   |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_bow        |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_dagger     |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_instrument |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_polearm    |  ☐   |  ☐   |  ☐   |   ☐    |
| 1h_staff      |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_ancient    |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_axe        |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_bludgeon   |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_bow        |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_dagger     |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_polearm    |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_staff      |  ☐   |  ☐   |  ☐   |   ☐    |
| 2h_sword      |  ☐   |  ☐   |  ☐   |   ☐    |

## Notes
- `1h_sword` data is collected but **not yet verified/imported** (next:
  say "verify"). `amulet` commands are ready; data not yet collected.
- Nothing has been `--apply`'d to the DB yet.
- Deferred by decision: weapon `hit`/`dmg`/`crit` columns (in `ignore.txt`,
  TODO in [docs/manual-onboard.md](../../docs/manual-onboard.md)).
