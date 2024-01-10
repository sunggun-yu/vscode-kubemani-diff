
export interface KubeBaseObject {
  readonly apiVersion: string;
  readonly  kind: string;
  readonly metadata: {
    readonly name: string;
  };
}

export type ItemOf = "A" | "B";
