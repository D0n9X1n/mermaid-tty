// What a drawing must show, from plan A §6. T11 adds validate(d: Drawing): Fail | null here.
export type Expect = {
  labels: readonly { owner: string; text: string }[]                                     // every label instance, keyed by owner id
  edges: readonly { id: string; from: string; to: string; heads: readonly string[] }[]  // drawn edges; ~~~ is not listed
  edgeLabels: readonly { owner: string; edge: string }[]
}
