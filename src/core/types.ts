export type FileMeta = { id: string; filename: string; mime: string; size: number; created: string }
export type Doc = {
  path: string
  title: string
  body: string
  projects: string[]
  created: string
  updated: string
  bodyHash: string
  files: FileMeta[]
}
export type DocIndex = { docs: Doc[] }
