# Braille mapping & timing

The single source of truth in code is [`apps/web/lib/braille.ts`](../apps/web/lib/braille.ts).
This doc explains it.

## Cell numbering
One braille cell is a 2×3 grid of dots:

```
1 4
2 5
3 6
```

A cell is encoded as a **6-character string** of `0`/`1` in dot order **1..6**. Example:
`"100100"` = dots 1 and 4 raised = the letter **c**. This exact string is what the browser
sends to the firmware as `B<bits>` (see `firmware/PROTOCOL.md`).

## Letters (Grade 1)
| | | | | |
|---|---|---|---|---|
| a `100000` | b `110000` | c `100100` | d `100110` | e `100010` |
| f `110100` | g `110110` | h `110010` | i `010100` | j `010110` |
| k `101000` | l `111000` | m `101100` | n `101110` | o `101010` |
| p `111100` | q `111110` | r `111010` | s `011100` | t `011110` |
| u `101001` | v `111001` | w `010111` | x `101101` | y `101111` |
| z `101011` | | | | |

## Numbers
Digits reuse the letter shapes **a–j**, preceded by the **number sign** `⠼` = `001111` (dots
3-4-5-6). The sign stays in effect across a run of digits and is cancelled by any non-digit.

`1`=a `2`=b `3`=c `4`=d `5`=e `6`=f `7`=g `8`=h `9`=i `0`=j

So "42" → `001111` (number sign) · `100110` (d=4) · `110000` (b=2).

## Capitals
A capital letter is preceded by the **capital sign** `⠠` = `000001` (dot 6). One sign capitalises
the next letter. (Word-level double-capitals are not implemented — not needed for teaching.)

## Punctuation & space
| char | dots | bits |
|---|---|---|
| space | — | `000000` |
| `.` | 2-5-6 | `010011` |
| `,` | 2 | `010000` |
| `;` | 2-3 | `011000` |
| `:` | 2-5 | `010010` |
| `?` | 2-3-6 | `011001` |
| `!` | 2-3-5 | `011010` |
| `'` | 3 | `001000` |
| `-` | 3-6 | `001001` |

Unknown characters render as a blank cell (`000000`) so pacing stays intact.

## Speed (the potentiometer knob)
The firmware streams the raw 12-bit ADC value as `POT <0-4095>` at ~10 Hz. The browser maps it
([`apps/web/lib/speed.ts`](../apps/web/lib/speed.ts)):

```
cps     = 3 + (pot / 4095) * 7      # 3 … 10 characters per second
delayMs = 1000 / cps                # ≈ 333 ms (slow) … 100 ms (fast) between characters
```

The delay is read **per character**, so turning the knob mid-word changes the pace live.

## Scope / future
MVP covers a–z, 0–9, space and the punctuation above (Grade 1 / uncontracted). Grade 2
contractions (whole-word and letter-group signs) are a natural extension: add multi-cell entries
to the map and emit them in `textToCells()`.
