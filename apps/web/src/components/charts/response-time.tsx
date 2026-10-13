'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

export interface ResponseTimeDatum {
  date: string
  avgMinutes: number
}

interface ResponseTimeChartProps {
  data: ResponseTimeDatum[]
}

export function ResponseTimeChart({ data }: ResponseTimeChartProps) {
  if (data.length === 0 || data.every((d) => d.avgMinutes === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No response time data yet</p>
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'short' })}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            axisLine={false}
            tickFormatter={(value) => `${value}m`}
          />
          <Tooltip
            formatter={(value: number) => [`${value} minutes`, 'Avg Response']}
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="avgMinutes"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
