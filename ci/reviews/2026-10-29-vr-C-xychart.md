---
scope: vr-C-xychart
verdict: pass
date: 2026-10-29
reviewers: [PM, cross-family:gpt-6-astra]
---
## Files
| path | sha256 |
|---|---|
| core/themes.ts | f02b332b877fa2bb6b9a79d0101494657a92ffd3c33c438b967c1bd9fd9c6553 |
| goldens/xychart/xychart-ok-01.golden | b60b85a9c949dd64cb068a1d98907d641fcb6699886f57f7742fa6199278bf0c |
| goldens/xychart/xychart-ok-02.golden | fa20c07b31a8b0895ea31e5595d333ff2c320318e8780a215e172c8c2a34adc6 |
| goldens/xychart/xychart-ok-03.golden | cc05760fe1d504c66daf1832a25a1e0cb3c6517fd6d5600de40fb9d794c2e837 |
| goldens/xychart/xychart-ok-04.golden | 3288b4dd705cfa19aa12d00358584acefc4d5993d195257f00b8aedad684ae32 |
| goldens/xychart/xychart-ok-05.golden | 4c878a90656444f23b6a157f909df67bde304f7020aab1c4c343f95b4fa6e2d9 |
| goldens/xychart/xychart-ok-06.golden | 5a8bfbab5457ea45bedbf0435db31976046a172cbdd1270d31c30244772794ac |
| goldens/xychart/xychart-ok-07.golden | 2b3c52edc16e76f686d1866527d5e4ece266f9628c75cce68aed66540319902b |
| goldens/xychart/xychart-ok-08.golden | 439e7feb1a2226ef0f379746e6cc0bf62204beae4d0097607833be95fa460add |
| goldens/xychart/xychart-ok-09.golden | 68560ef665ada485fa29f8ca22c625a03230d93e0b52457c67cf054418633fdd |
| goldens/xychart/xychart-ok-10.golden | 2da20836c4a25cf2c0eef2afd9247cd79b9f137924526eb9b102e11faceaa95a |
| goldens/xychart/xychart-ok-11.golden | b60b85a9c949dd64cb068a1d98907d641fcb6699886f57f7742fa6199278bf0c |
## Notes
- PM inspected the rendered gallery (PNGs of the largest goldens at 80 columns, plus the CJK sheet): every label readable, not tangled, roles told apart, faithful to the source.
- The cross-family reviewer (gpt-6-astra) read every xychart golden's text and role map against its source at 60, 80 and 120 columns, checking fidelity (elements, order, values, relations), readability and roles: pass.
