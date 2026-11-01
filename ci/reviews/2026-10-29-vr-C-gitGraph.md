---
scope: vr-C-gitGraph
verdict: pass
date: 2026-10-29
reviewers: [PM, cross-family:gpt-6-astra]
---
## Files
| path | sha256 |
|---|---|
| core/themes.ts | e47d91952041be69bb7c74837f0e93160662abbea680f00fbecbd363fe995067 |
| goldens/gitGraph/gitGraph-ok-01.golden | 740ac97923e622628c3c175f9e8e01b5125dd6d5831052dd7607d69927fca2cb |
| goldens/gitGraph/gitGraph-ok-02.golden | 8dc87042ef0aeaf4f59cbe1b2525261442196e0f400c83e2dbf1504832e85dd9 |
| goldens/gitGraph/gitGraph-ok-03.golden | 4ee8cbc78ea2d016f032e70f8d78bcaa231a03b4b94db5b18216cff7d141dd0c |
| goldens/gitGraph/gitGraph-ok-04.golden | 5ff6f7ebf28ceb78af2c971f34c20370a0d184f5522c3be53bd17fa7aed8b1a2 |
| goldens/gitGraph/gitGraph-ok-05.golden | 161c739001dbe097203b92ab8154ab2bf328809ef2863fc3c792503ecdc7635b |
| goldens/gitGraph/gitGraph-ok-06.golden | 30ca24902936c16cf4e0d220943da3f1844a3717e784a567152ccbec9258b2fe |
| goldens/gitGraph/gitGraph-ok-07.golden | 707a8cfdea6e77a44a1af435a5719456421e6252cf72c5d912ac7493f9a1ae50 |
| goldens/gitGraph/gitGraph-ok-08.golden | 0ab651fbbd7aa69ef04ed3aa675e6480ebf29decabd9c8504ca86243d3c55415 |
| goldens/gitGraph/gitGraph-ok-09.golden | 86ab27094cb7eb058550f51ab9fee67677c2461d6fe6d19ed8c2434a8c317f9f |
| goldens/gitGraph/gitGraph-ok-10.golden | 2488fc8dd03f9fdfbfd32cc70038596787c808348e1893d1da4867027fdb6f6b |
| goldens/gitGraph/gitGraph-ok-11.golden | 8dc87042ef0aeaf4f59cbe1b2525261442196e0f400c83e2dbf1504832e85dd9 |
| goldens/gitGraph/gitGraph-ok-12.golden | 4ee8cbc78ea2d016f032e70f8d78bcaa231a03b4b94db5b18216cff7d141dd0c |
| goldens/gitGraph/gitGraph-ok-13.golden | 4ee8cbc78ea2d016f032e70f8d78bcaa231a03b4b94db5b18216cff7d141dd0c |
| goldens/gitGraph/gitGraph-ok-14.golden | 4ee8cbc78ea2d016f032e70f8d78bcaa231a03b4b94db5b18216cff7d141dd0c |
| goldens/gitGraph/gitGraph-ok-15.golden | f581b952f29abeb3a2cca6eab6773ba57b3db56fe399cfb9f3b3ea744472cad2 |
| goldens/gitGraph/gitGraph-ok-16.golden | 04dfe23d6d18a3cc75cd1969a34ef93800eb571d9f3c8854ac32e3cfed8d6e79 |
## Notes
- PM inspected the rendered gallery (the largest gitGraph goldens at 80, and the fixed merge rows): lanes, forks, merges, tags and cherry-picks read as the source says.
- The cross-family reviewer (gpt-6-astra) first failed five goldens: a lane that ended at a merge row drew a junction (┴) that read as joining the merge. Commit 69e5814 ends such a lane one row above and crosses an empty column; the re-review of all 15 goldens at 60, 80 and 120 passed.
- v1.1.1 (#16): the cross-family reviewer (gpt-6-astra) read gitGraph-ok-16 (a %%{init}%% directive setting mainBranchName) against its source at 60, 80 and 120 columns: branches, topology and roles pass. Mermaid also shows the two bare commits' generated ids (0- or 1- plus a random suffix), which change on every render; the PM ruled they stay hidden, as wiki Usage documents.
- 2026-10-31: core/themes.ts re-hashed after formatting-only changes (Prettier, braces, comment wrapping). The exported THEMES object is identical before and after, and every golden is byte-identical to the reviewed commit, so the verdict stands.
- 2026-10-31: 1 golden(s) re-hashed after the title moved to the center of its drawing (gitGraph-ok-07). Each changed only in its title row's leading spaces, checked line by line against the reviewed golden; every other row and every role row is byte-identical, so the verdict stands.
- 2026-10-31: core/themes.ts re-hashed after each palette gained `surface`, a second shade only pictures use. No role, series or background changed, and every golden is byte-identical, so the verdict stands.
