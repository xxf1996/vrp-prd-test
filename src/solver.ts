import { Coord, PlanInput, PlanMode, VRPRoute, VRPSolve } from "./types.d"
import { range, shuffle, sort, draw, max } from 'radash'

/** 驾驶速度（km/h） */
const DRIVE_SPEED = 50

function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

function haversineDistance(coord1: Coord, coord2: Coord) {
  const { longitude: lon1, latitude: lat1 } = coord1;
  const { longitude: lon2, latitude: lat2 } = coord2;
  const R = 6371; // 地球半径，单位km
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const deltaLatRad = toRadians(lat2 - lat1);
  const deltaLonRad = toRadians(lon2 - lon1);

  const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 计算出的距离，单位km
}

class VRPSolver {
  /** 时间权重 */
  private weightTime = 1
  /** 距离权重 */
  private weightDistance = 1
  /** 司机数量 */
  private driverNum = 10
  private coords: Coord[]
  /** 当前种群 */
  private population: number[][] = []
  /** 种群中的个体数量（每个个体都是一个潜在的解） */
  private individualNum = 100
  /** 每次进化选择的个数，即直接进入下一代 */
  private selectedNum = 50
  /** 进化轮数，即迭代次数 */
  private iterNum = 200
  constructor(warehouse: Coord, private stops: Coord[]) {
    this.coords = [warehouse, ...stops]
    this.initPopulation()
  }

  private initPopulation() {
    for(let i = 0; i < this.individualNum; i++) {
      // 0代表仓库，1-n代表停靠点（首尾两个0可以省去）；乱序1-n和m-1（m为车辆数量）个0作为初始个体
      this.population.push(shuffle([...range(1, this.stops.length), ...range(1, this.driverNum - 1, 0)]))
    }
  }

  private getFitness(individual: number[]) {
    const routes: number[][] = []

    let warehouseIdx = -1
    for(let i = 0; i < this.individualNum; i++) {
      if (individual[i] === 0) {
        const route = individual.slice(warehouseIdx + 1, i)
        if (route.length > 0) { // 当前情况可能存在多个连续为0的情况，即没有发车
          routes.push(route)
        }
        warehouseIdx = i
      }
    }

    // 最后一条路线
    if (warehouseIdx !== this.individualNum - 1) {
      const route = individual.slice(warehouseIdx + 1)
      if (route.length > 0) {
        routes.push(route)
      }
    }

    const distances = routes.map(route => this.getRouteDistance(route))
    const totalDistance = distances.reduce((a, b) => a + b, 0)
    // 总耗时应该是所有路线中耗时最多的那个
    const totalTime = max(routes.map((_, idx) => this.getRouteTime(distances[idx])))!
    const cost = (this.weightTime * totalTime + this.weightDistance * totalDistance) / (this.weightTime + this.weightDistance)

    return {
      fitness: -cost, // 适应度越大越好(对应cost越小越好)
      routes,
      totalDistance,
      totalTime
    }
  }

  /**
   * 选择适应度最高的n个个体，即直接进入下一代
   */
  private select() {
    return sort(this.population, individual => this.getFitness(individual).fitness, true).slice(0, this.selectedNum)
  }

  /**
   * 批量变异操作
   */
  private mutation() {
    const mutations: number[][] = []

    for(let i = 0; i < this.individualNum - this.selectedNum; i++) {
      // 从当前种群中随机挑选一个个体，然后变异（基于随机打乱）
      const source = draw(this.population)!
      mutations.push(shuffle(source))
    }

    return mutations
  }

  /** 繁殖，得到下一代 */
  private reproduce() {
    const selectedIndividuals = this.select()
    const mutations = this.mutation()
    this.population = [...selectedIndividuals, ...mutations]
  }

  private getRouteDistance(route: number[]) {
    // 添加仓库位置作为起点和终点
    const fullRoute = [0, ...route, 0]
    let distance = 0

    for (let i = 0; i < fullRoute.length - 1; i++) {
      distance += this.getDistanceBetweenCoords(this.coords[fullRoute[i]], this.coords[fullRoute[i + 1]])
    }

    return distance
  }

  private getDistanceBetweenCoords(coord1: Coord, coord2: Coord) {
    // NOTICE: 这里使用大圆距离公式近似计算两个球面坐标点之间的直线距离，实际业务应该基于地图导航距离计算？
    return haversineDistance(coord1, coord2)
  }

  /**
   * 获取当前路线司机需要的总时长，单位为h
   *
   * 考虑到一天8小时工作的限制，每8小时真正的耗时为24小时，而剩余的不足8小时的时间，理论上最快可以按0点起算（虽说这么设计好像有点不太人道……）
   * @param distance 路线总距离，单位km
   * @returns
   */
  private getRouteTime(distance: number) {
    const driverTime = distance / DRIVE_SPEED
    const fullDay = Math.floor(driverTime / 8)
    const lasyTime = driverTime % 8

    return fullDay * 24 + lasyTime
  }

  setWeights(weightTime: number, weightDistance: number) {
    this.weightTime = weightTime
    this.weightDistance = weightDistance
  }

  solve(): VRPSolve {
    for(let i = 0; i < this.iterNum; i++) {
      this.reproduce()
    }

    const results = sort(this.population, individual => this.getFitness(individual).fitness, true)
    const { routes, totalDistance, totalTime } = this.getFitness(results[0])

    return {
      routes: routes.map(route => {
        const res: VRPRoute = {
          paths: [],
          indices: [],
          distance: this.getRouteDistance(route),
          driveTime: 0,
          time: 0,
          googleMapUrl: ''
        }

        res.driveTime = res.distance / DRIVE_SPEED
        res.time = this.getRouteTime(res.distance)
        res.indices = [0, ...route, 0]
        res.paths = res.indices.map(idx => this.coords[idx])
        const coords = res.paths.map(path => `${path.latitude},${path.longitude}`)
        res.googleMapUrl = `https://www.google.com/maps/dir/${coords.join('/')}`

        return res
      }),
      totalDistance,
      totalTime
    }
  }
}

function generate(formData: PlanInput) {
  console.log(formData)
  const solver = new VRPSolver(formData.warehouse, formData.stops)

  if (formData.mode === PlanMode.TimeOptimized) {
    solver.setWeights(100, 1)
  } else if (formData.mode === PlanMode.DistanceOptimized) {
    solver.setWeights(1, 100)
  }

  console.time('solve')
  const plan = solver.solve()
  console.timeEnd('solve')

  return plan
}

// function test() {
//   const warehouse: Coord = {
//     longitude: 120.504588,
//     latitude: 23.7102884
//   }
//   const stops: Coord[] = [
//     {
//       longitude: 120.104588,
//       latitude: 23.1102884
//     },
//     {
//       longitude: 120.8478606,
//       latitude: 23.8715329,
//     },
//     {
//       longitude: 120.902588,
//       latitude: 23.2102884
//     },
//     {
//       longitude: 120.6986373,
//       latitude: 23.9083593,
//     },
//     {
//       longitude: 121.5247155,
//       latitude: 25.2190197
//     },
//     {
//       longitude: 120.2078873,
//       latitude: 23.4250174
//     },
//   ]

//   const solver = new VRPSolver(warehouse, stops)
//   const result = solver.solve()
//   console.log(result)
// }

onmessage = (event: MessageEvent<PlanInput>) => {
  const plan = generate(event.data)
  postMessage(plan)
}
