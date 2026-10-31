---
scope: vr-C-mindmap
verdict: pass
date: 2026-10-29
reviewers: [PM, cross-family:gpt-6-astra]
---
## Files
| path | sha256 |
|---|---|
| core/themes.ts | 8fbbedf7070b3ef947f7367b8642eb0a364f39ea37e77a89c6cc7a742be7f6c5 |
| goldens/mindmap/mindmap-ok-01.golden | 0fdc6db58d4f48e4f1817a77257cc0b79c4f89cb7af94968aec3a762aecd02d5 |
| goldens/mindmap/mindmap-ok-02.golden | bb0579b15cb78681a5ef29d6a7061d758cc611a0fa3ecdfc78de28ffa98de144 |
| goldens/mindmap/mindmap-ok-03.golden | 3d901e7c24672ad44f7709181ac6facaee0733c2fd9e44faf4ed04a1fd89cb80 |
| goldens/mindmap/mindmap-ok-04.golden | 4c2d81955e5391f3e62868515c75d61bcef08db5756e3b2213d1d09c7fb9ce87 |
| goldens/mindmap/mindmap-ok-05.golden | 0fdc6db58d4f48e4f1817a77257cc0b79c4f89cb7af94968aec3a762aecd02d5 |
| goldens/mindmap/mindmap-ok-06.golden | 75f5ec01f64acad40eb8370bfdd23ae3529b26ef04cbe1e79812b63e88a38e13 |
| goldens/mindmap/mindmap-ok-07.golden | e8910e87afaeef7899ec35ebbb9015cb9ac7aa10ef09468a0cd2753036f30b3e |
| goldens/mindmap/mindmap-ok-08.golden | 76ffa1c602b1916fcfe10dce4b1824fa7f103b8df985ab2f82db5d49adccc0be |
| goldens/mindmap/mindmap-ok-09.golden | bbb20fbf4699f280e07665b906bc853d10e4f0a86c8c96d12f96da6150a2e4eb |
| goldens/mindmap/mindmap-ok-10.golden | ff12b89bf139eca8718a428c8d4de66f61a9ba9a279c4b6376493a83c4237724 |
| goldens/mindmap/mindmap-ok-11.golden | 7dcd838f77a8f3fed03e5165ab145f6eb9fc98d7630ccf0eb4c5bed57f1e164f |
| goldens/mindmap/mindmap-ok-12.golden | 4897a33e243dacdf3d6e35ae32e8311bcb3dc457f9f66856e978e0f818843e89 |
| goldens/mindmap/mindmap-ok-13.golden | 4b39d30c42f0f8010480d8cd3fa4ae8a4799eddfbaf66f872375cb67d750a70c |
| goldens/mindmap/mindmap-ok-14.golden | 0fdc6db58d4f48e4f1817a77257cc0b79c4f89cb7af94968aec3a762aecd02d5 |
| goldens/mindmap/mindmap-ok-15.golden | 575fa09322dd091418271ee42888ef0d7f79c30cd3b18eb01902a3d9dfcd17e1 |
## Notes
- PM inspected the rendered gallery (PNGs of the largest goldens at 80 columns, plus the CJK sheet): every label readable, not tangled, roles told apart, faithful to the source.
- The cross-family reviewer (gpt-6-astra) read every mindmap golden's text and role map against its source at 60, 80 and 120 columns, checking fidelity (elements, order, values, relations), readability and roles: pass.
- v1.1.1 (#15): the cross-family reviewer (gpt-6-astra) read the new Markdown bold and italic golden, its text, roles and styles, against its source at 60, 80 and 120 columns and against Mermaid 12.2.0, and passed it. No existing golden changed.
- 2026-10-31: core/themes.ts re-hashed after formatting-only changes (Prettier, braces, comment wrapping). The exported THEMES object is identical before and after, and every golden is byte-identical to the reviewed commit, so the verdict stands.
- 2026-10-31: 1 golden(s) re-hashed after the title moved to the center of its drawing (mindmap-ok-06). Each changed only in its title row's leading spaces, checked line by line against the reviewed golden; every other row and every role row is byte-identical, so the verdict stands.
