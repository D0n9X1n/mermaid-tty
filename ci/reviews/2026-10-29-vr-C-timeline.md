---
scope: vr-C-timeline
verdict: pass
date: 2026-10-29
reviewers: [PM, cross-family:gpt-6-astra]
---
## Files
| path | sha256 |
|---|---|
| core/themes.ts | e47d91952041be69bb7c74837f0e93160662abbea680f00fbecbd363fe995067 |
| goldens/timeline/timeline-ok-01.golden | fd21900f66fa40f5802537d097bf3fbef85d0670402808532a7a15b0d02f92d7 |
| goldens/timeline/timeline-ok-02.golden | a60fb9399424ceb2ddd8ec4feb7307f8c90916f41d9564005f6079f4b6dcc4e7 |
| goldens/timeline/timeline-ok-03.golden | 2b3bd6bbf546a6da11d78aaa2cae6dd00110598986ec0c86e48dc2db8a18ccd8 |
| goldens/timeline/timeline-ok-04.golden | e5861a503e1053ea55612b7ade8e72ca7579eab8b70436bd075e58de13154438 |
| goldens/timeline/timeline-ok-05.golden | 53e59b213b5027a3f6888329ed5bc4713e9ec610c4eb50189bbfce9901b5b9cc |
| goldens/timeline/timeline-ok-06.golden | 0dde88cdf9962c01cfc903599f3ad7f1b78f04de815b34e103cbc2f90c0c6872 |
| goldens/timeline/timeline-ok-07.golden | 6a088a91e55d4cc23649b65ef6143f14cf59b8f357270c692c7cfd4d550cfcc5 |
| goldens/timeline/timeline-ok-08.golden | 838f55617f7ed25a66a705682761ae2eb2920d0f2d6484b4fb81c3958831f750 |
| goldens/timeline/timeline-ok-09.golden | 867afbd207f965bbb37cd51cfeb582ce2776ac92f829dfe811d91003d6c9555c |
| goldens/timeline/timeline-ok-10.golden | ff89a511c542b7fce1b69080eeb64724d3c54f6f00509481092c947b33b7202f |
| goldens/timeline/timeline-ok-11.golden | b989ddec90f26c1912f0f024b65a5867a0d5faad67a61af7000e3b8d9cc75267 |
| goldens/timeline/timeline-ok-12.golden | 2055d14b012bb6dee4afcfcb758a3bd31650ba21790716f48362fed395127d02 |
| goldens/timeline/timeline-ok-13.golden | fd21900f66fa40f5802537d097bf3fbef85d0670402808532a7a15b0d02f92d7 |
| goldens/timeline/timeline-ok-14.golden | 1590516c6eaca610aaba86a3f505d2f30a029b5c91c52e6736bc05cbffd66620 |
## Notes
- PM inspected the rendered gallery (PNGs of the largest goldens at 80 columns, plus the CJK sheet): every label readable, not tangled, roles told apart, faithful to the source.
- The cross-family reviewer (gpt-6-astra) read every timeline golden's text and role map against its source at 60, 80 and 120 columns, checking fidelity (elements, order, values, relations), readability and roles: pass.
- 2026-10-31: core/themes.ts re-hashed after formatting-only changes (Prettier, braces, comment wrapping). The exported THEMES object is identical before and after, and every golden is byte-identical to the reviewed commit, so the verdict stands.
- 2026-10-31: 6 golden(s) re-hashed after the title moved to the center of its drawing (timeline-ok-01, timeline-ok-03, timeline-ok-07, timeline-ok-08, timeline-ok-09, timeline-ok-13). Each changed only in its title row's leading spaces, checked line by line against the reviewed golden; every other row and every role row is byte-identical, so the verdict stands.
- 2026-10-31: core/themes.ts re-hashed after each palette gained `surface`, a second shade only pictures use. No role, series or background changed, and every golden is byte-identical, so the verdict stands.
