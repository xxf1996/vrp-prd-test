import { isEmpty } from 'radash'
import { Form, Table, TableProps, Button, Radio, Select, Space, InputNumber, FormRule, Timeline, Descriptions } from 'antd'
import { useState } from 'react'
import { DeleteOutlined } from '@ant-design/icons'
import { Coord, CoordInputProps, DataFormProps, LatitudeOption, LongitudeOption, PlanInput, PlanTableProps, StopsInputProps, VRPRoute, VRPSolve, WidthID } from './types.d'
import VRPWorker from './solver?worker&inline'


const { Option } = Select
// 将VRP算法计算逻辑抽离到worker，避免阻塞主线程
const worker = new VRPWorker()

function LongitudeType({ onChange }: { onChange?: (value: LongitudeOption) => void }) {
  return (
    <Select defaultValue="E" onChange={onChange}>
      <Option value="E">E</Option>
      <Option value="W">W</Option>
    </Select>
  )
}

function LatitudeType({ onChange }: { onChange?: (value: LatitudeOption) => void }) {
  return (
    <Select defaultValue="N" onChange={onChange}>
      <Option value="N">N</Option>
      <Option value="S">S</Option>
    </Select>
  )
}

function CoordInput(props: CoordInputProps) {
  const { onChange } = props
  const [longitude, setLongitude] = useState(0)
  const [latitude, setLatitude] = useState(0)
  const [longitudeType, setLongitudeType] = useState<LongitudeOption>('E')
  const [latitudeType, setLatitudeType] = useState<LatitudeOption>('N')

  const trigger = (newVal: Partial<Coord> = {}) => {
    // NOTICE: set state并不是同步的
    onChange?.({ longitude, latitude, ...newVal })
  }
  const changeLongitude = (val: number) => {
    setLongitude(val)
    trigger({ longitude: longitudeType === 'E' ? val : -val })
  }

  const changeLatitude = (val: number) => {
    setLatitude(val)
    trigger({ latitude: latitudeType === 'N' ? val : -val })
  }

  const changeLongitudeType = (val: LongitudeOption) => {
    setLongitudeType(val)
    trigger({ longitude: val === 'E' ? longitude : -longitude })
  }

  const changeLatitudeType = (val: LatitudeOption) => {
    setLatitudeType(val)
    trigger({ latitude: val === 'N' ? latitude : -latitude })
  }

  return (
    <Space direction="horizontal">
      <InputNumber value={longitude} addonBefore={<LongitudeType onChange={changeLongitudeType} />} placeholder="Longitude" min={0} max={180} step={1e-6} onChange={val => changeLongitude(val ?? NaN)} />
      <InputNumber value={latitude} addonBefore={<LatitudeType onChange={changeLatitudeType} />} placeholder="Latitude" min={0} max={90} step={1e-6} onChange={val => changeLatitude(val ?? NaN)} />
    </Space>
  )
}

let stopID = 0

function StopsInput(props: StopsInputProps) {
  const { onChange } = props
  const [stops, setStops] = useState<WidthID<Coord>[]>([])
  const trigger = (newVal: Coord[] = []) => {
    onChange?.(newVal)
  }
  const withoutID = (val: WidthID<Coord>[]) => val.map(stop => stop.value)
  const changeStop = (val: Coord, index: number) => {
    const newStops = [...stops]
    newStops[index].value = val
    setStops(newStops)
    trigger(withoutID(newStops))
  }
  const removeStop = (index: number) => {
    const newStops = [...stops]
    newStops.splice(index, 1)
    setStops(newStops)
    trigger(withoutID(newStops))
  }
  const addStop = () => {
    const stop: Coord = {
      longitude: 0,
      latitude: 0
    }
    const newStops = [...stops, { id: stopID, value: stop }]
    setStops(newStops)
    trigger(withoutID(newStops))
    stopID++
  }

  return (
    <Space direction="vertical">
      {(stops).map((stop, index) => (
        // NOTICE: react必须确保key是唯一的
        <Space key={stop.id} direction="horizontal">
          <CoordInput
            value={stop.value}
            onChange={val => changeStop(val, index)}
          />
          <Button icon={<DeleteOutlined />} onClick={() => removeStop(index)} />
        </Space>
      ))}
      <Button type="primary" onClick={addStop}>Add Stop</Button>
    </Space>
  )
}

const warehouseRules: FormRule[] = [
  {
    required: true,
    validator(_rule, value) {
      if (!value ) {
        return Promise.reject('Please input your warehouse position!')
      }
      if (isEmpty(value.longitude)) {
        return Promise.reject('Please input a longitude!')
      }
      if (isEmpty(value.latitude)) {
        return Promise.reject('Please input a latitude!')
      }
      return Promise.resolve()
    },
  }
]
const stopsRules: FormRule[] = [
  {
    required: true,
    validator(_rule, value: Coord[]) {
      if (isEmpty(value)) {
        return Promise.reject('Please add your stops!')
      }
      if (value.some(stop => isEmpty(stop.longitude) || isEmpty(stop.latitude))) {
        return Promise.reject('Stop location cannot be empty!')
      }
      return Promise.resolve() // NOTICE: 不返回默认就没有结束校验，也就不会触发onFinish
    },
  }
]

function DataForm({ onGenerate }: DataFormProps) {
  const [loading, setLoading] = useState(false)
  worker.onmessage = (event: MessageEvent<VRPSolve>) => {
    onGenerate(event.data)
    setLoading(false)
  }
  return <Form
    name="basic"
    labelCol={{ span: 8 }}
    wrapperCol={{ span: 16 }}
    className="max-w-150 mx-auto"
    autoComplete="off"
    onFinish={(values) => {
      setLoading(true)
      worker.postMessage(values)
    }}
  >
    <Form.Item<PlanInput>
      label="Warehouse Position"
      name="warehouse"
      rules={warehouseRules}
    >
      <CoordInput />
    </Form.Item>
    <Form.Item<PlanInput>
      label="Stops"
      name="stops"
      rules={stopsRules}
    >
      <StopsInput />
    </Form.Item>
    <Form.Item<PlanInput>
      label="Plan Mode"
      name="mode"
      initialValue={0}
    >
      <Radio.Group>
        <Radio.Button value={0}>Time Optimized</Radio.Button>
        <Radio.Button value={1}>Distance Optimized</Radio.Button>
        {/* <Radio.Button value={2}>Balance</Radio.Button> */}
      </Radio.Group>
    </Form.Item>

    <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
      <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>
        Generate dispatch plan
      </Button>
    </Form.Item>
  </Form>
}

function formatNumber(val: number) {
  return val.toFixed(2)
}

const planTableCols: TableProps<VRPRoute>['columns'] = [
  {
    title: 'Driver',
    key: 'paths',
    render(_, __, index) {
      return <span>Driver {index + 1}</span>
    }
  },
  {
    title: 'Route',
    key: 'paths',
    render(_, record) {
      return (
        <Timeline items={record.indices.map(idx => ({ children: idx === 0 ? 'Warehouse' : `Stop ${idx}`, color: idx === 0 ? 'green' : 'blue' }))} />
      )
    }
  },
  {
    title: 'Distance(km)',
    key: 'distance',
    dataIndex: 'distance',
    render: formatNumber
  },
  {
    title: 'Total Time(h)',
    key: 'time',
    dataIndex: 'time',
    render: formatNumber
  },
  {
    title: 'Drive Time(h)',
    key: 'driveTime',
    dataIndex: 'driveTime',
    render: formatNumber
  },
  {
    title: 'Google Map',
    key: 'googleMapUrl',
    dataIndex: 'googleMapUrl',
    render(url: string) {
      return <a href={url} target="_blank" rel="noreferrer">{url}</a>
    }
  }
]
function PlanTable({ plan }: PlanTableProps) {
  return (
    <>
      <Descriptions className="mt-12" title="Dispatch Plan" items={[
        { label: 'Total Distance(km)', key: 'totalDistance', children: formatNumber(plan.totalDistance) },
        { label: 'Total Time(h)', key: 'totalTime', children: formatNumber(plan.totalTime) },
        { label: 'Drivers', key: 'drivers', children: plan.routes.length }
      ]} />
      <Table className="mt-4" columns={planTableCols} dataSource={plan.routes} />
    </>
  )
}

function App() {
  const [plan, setPlan] = useState<VRPSolve>()
  return (
    <div className="p4">
      <DataForm onGenerate={setPlan} />
      { plan ? <PlanTable plan={plan} /> : null}
    </div>
  )
}

export default App
