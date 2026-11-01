---
scope: vr-C-xychart
verdict: pass
date: 2026-10-29
reviewers: [PM, cross-family:gpt-6-astra]
---
## Files
| path | sha256 |
|---|---|
| core/themes.ts | e47d91952041be69bb7c74837f0e93160662abbea680f00fbecbd363fe995067 |
| goldens/xychart/xychart-ok-01.golden | 0830ae3bb0b253ae4e822a7695db97e4838e7a42871e5b772432bc7c4ff1f5fb |
| goldens/xychart/xychart-ok-02.golden | 94dad403b17da955cb1e80bdc2fe17d6f179c62243842ed27b72f6923c503f9f |
| goldens/xychart/xychart-ok-03.golden | cc05760fe1d504c66daf1832a25a1e0cb3c6517fd6d5600de40fb9d794c2e837 |
| goldens/xychart/xychart-ok-04.golden | c5ff81399dffa31d3749454681512a03adc07abe60b8c46c415a3a6817ecebf7 |
| goldens/xychart/xychart-ok-05.golden | 20535ac8ee9acd7ff774f124117c34181d55fbb2397b9762def1560bd97f85ef |
| goldens/xychart/xychart-ok-06.golden | e3f36f1b1e83337a9db0f23fedaf2f05f35bc7963ff12aa0a7aa48ec23d1d944 |
| goldens/xychart/xychart-ok-07.golden | 2b3c52edc16e76f686d1866527d5e4ece266f9628c75cce68aed66540319902b |
| goldens/xychart/xychart-ok-08.golden | 792f498a1df590d70f651c8c51466e258f1cef91afae5865ec8999a550d53335 |
| goldens/xychart/xychart-ok-09.golden | 68560ef665ada485fa29f8ca22c625a03230d93e0b52457c67cf054418633fdd |
| goldens/xychart/xychart-ok-10.golden | 2da20836c4a25cf2c0eef2afd9247cd79b9f137924526eb9b102e11faceaa95a |
| goldens/xychart/xychart-ok-11.golden | 0830ae3bb0b253ae4e822a7695db97e4838e7a42871e5b772432bc7c4ff1f5fb |
## Notes
- PM inspected the rendered gallery (PNGs of the largest goldens at 80 columns, plus the CJK sheet): every label readable, not tangled, roles told apart, faithful to the source.
- The cross-family reviewer (gpt-6-astra) read every xychart golden's text and role map against its source at 60, 80 and 120 columns, checking fidelity (elements, order, values, relations), readability and roles: pass.
- 2026-10-31: core/themes.ts re-hashed after formatting-only changes (Prettier, braces, comment wrapping). The exported THEMES object is identical before and after, and every golden is byte-identical to the reviewed commit, so the verdict stands.
- 2026-10-31: 7 golden(s) re-hashed after the title moved to the center of its drawing (xychart-ok-01, xychart-ok-02, xychart-ok-04, xychart-ok-05, xychart-ok-06, xychart-ok-08, xychart-ok-11). Each changed only in its title row's leading spaces, checked line by line against the reviewed golden; every other row and every role row is byte-identical, so the verdict stands.
- 2026-10-31: core/themes.ts re-hashed after each palette gained `surface`, a second shade only pictures use. No role, series or background changed, and every golden is byte-identical, so the verdict stands.
