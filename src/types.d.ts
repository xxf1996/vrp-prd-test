export interface Coord {
  /** 经度 */
  longitude: number
  /** 纬度 */
  latitude: number
}

export interface VRPRoute {
  /** 路径坐标点，包括起始点 */
  paths: Coord[]
  /** 路径对应的索引，0为仓库 */
  indices: number[]
  /** 路线实际的耗时，单位为h */
  time: number
  /** 司机的驾驶时间，单位为h */
  driveTime: number
  /** 路线的距离，单位为km */
  distance: number
  /** 路线图google预览 */
  googleMapUrl: string
}

export interface VRPSolve {
  routes: VRPRoute[]
  totalDistance: number
  totalTime: number
}

export enum PlanMode {
  TimeOptimized,
  DistanceOptimized,
  Balance
}

export interface PlanInput {
  warehouse: Coord
  stops: Coord[]
  mode: PlanMode
}

export interface CoordInputProps {
  value?: Coord
  onChange?: (value: Coord) => void
}

export interface StopsInputProps {
  value?: Coord[]
  onChange?: (value: Coord[]) => void
}

export interface PlanTableProps {
  plan: VRPSolve
}

export interface DataFormProps {
  onGenerate: (plan: VRPSolve) => void
}

export type LatitudeOption = 'N' | 'S'
export type LongitudeOption = 'E' | 'W'
export type WidthID<T> = {
  id: number;
  value: T;
}