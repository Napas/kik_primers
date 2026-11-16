# Illustration trial (5 works)

Private doc. Date of trial and terms check: 2026-11-16.

## Tool

- Figma MCP `generate_image`, model `gemini-3.1-flash-image` (Google models chosen by the owner, 2026-11-16).
- 1024x1024, one call per work.
- File "Primer world – illustration trial" in the owner's Figma drafts.
- Paid Figma AI credits.
- Shipped files are resized to 640x640 with `sips -Z 640`.

## House-style prompt template

> Ink line art illustration with gold accents on a flat dark navy background (#0e1726). Minimal, elegant hand-drawn pen strokes in pale cream and warm gold (#d9b25f); no other colours, no gradients. No human faces, no text, no letters, no numbers, no logos, no signature. Square composition with generous empty space. Subject: <subject>.

## Subjects (file = work spot id)

- `metai`: a circular ring of the four seasons around an 18th-century Lithuanian village of thatched wooden houses: spring blossoms and a plough, summer hay and sheaves, autumn harvest and falling leaves, winter snow and bare trees, flowing into one another around the circle.
- `silelis`: a Lithuanian pine forest by a river; on one side tall old pines, in the foreground fresh tree stumps where the forest was felled, and between them a few young saplings growing back; a single bird on a branch.
- `altoriu-seseli`: the long shadow of a church altar with candles falling across a stone floor, and beside it an open window through which wide fields and a distant road are visible: a choice between the altar and the world outside.
- `balta-drobule`: a 1950s New York hotel elevator with its folding metal gate half open, tall skyscrapers seen beyond, and a white linen cloth drifting down through the elevator shaft like a memory of a far-away village.
- `dievu-miskas`: a dense, quiet pine forest on the Baltic coast seen through a tall barbed-wire camp fence with a wooden watchtower; one thin gold line of light between the trees.

## Terms checked (2026-11-16)

- Figma AI Terms, section 2: "Customer retains all right, title, and interest in Customer's Input and Output". There is no explicit commercial-use grant.
- Output may not be unique (section 6); clearances are the customer's job.
- Acceptable Use Policy, section 2(l): do not imply output is human-made; do not remove AI metadata or watermarks.
- The site's about page states the content was prepared with AI help.
- Content Training toggle: opting out is prospective (sections 3-4).
- Links: https://www.figma.com/legal/ai-terms/ , https://www.figma.com/legal/aup/

## AI provenance metadata

The generated PNGs carry an XMP block (`DigitalSourceType` = `trainedAlgorithmicMedia`, `photoshop:Credit` = "Made with Google AI"). It is kept in the shipped files: `sips` resizing preserved it, verified by searching the shipped files for the string. Do not strip it (Figma AUP 2(l)), and keep it when re-compressing.

## Outcome

The owner approved all 5 (2026-11-16) as stylised representations. Noted logical slips: the altar shadow in "Altorių šešėly", and the lift on an open balcony in "Balta drobulė".

Decision on illustrating the rest (user, 2026-11-16): a later change, with lighter images; a neutral agent reviews each image instead of the user.

## Shipped files

`site/topics/lietuviu-literatura/img/works/`, 640x640 PNG:

| File | Bytes |
| --- | --- |
| `metai.png` | 599094 |
| `silelis.png` | 595408 |
| `altoriu-seseli.png` | 470037 |
| `balta-drobule.png` | 504784 |
| `dievu-miskas.png` | 579459 |

Total about 2.7 MB. Each is over the ~400 KB target; no lossless-ish colour reducer is available (no pngquant, oxipng or PIL), so they are shipped as resized.
