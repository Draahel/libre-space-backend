export interface LocationResponse {
  id: string;
  name: string;
  type: string;
  childs?: LocationResponse[];
}
