function port(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback
  const number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < 1024 || number > 65535) {
    throw new Error('本地服务端口应为 1024 至 65535 之间的整数。')
  }
  return number
}

export function localPorts(env: Record<string, string | undefined>) {
  return {
    apiPort: port(env.XIANGQI_API_PORT, 3001),
    webPort: port(env.XIANGQI_WEB_PORT, 5173),
  }
}
