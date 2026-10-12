'use client'

import { prisma } from '@/lib/prisma'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface ResponseTimeChartProps {
  workspaceId: string
}

export async function ResponseTimeChart({ workspaceId }: ResponseTimeChartProps) {
  // Get last 7 days of response times
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId,
      firstContactedAt: { not: null, gte: sevenDaysAgo },
    },
    select: {
      createdAt: true,
      firstContactedAt: true,
    },
  })

  // Group by day and calculate average
  const dailyData = new Map<string, { total: number; count: number }>()
  
  leads.forEach((lead) => {
    if (lead.firstContactedAt) {
      const day = lead.createdAt.toISOString().split('T')[0]
      const responseMinutes = (lead.firstContactedAt.getTime() - lead.createdAt.getTime()) / (1000 * 60)
      const existing = dailyData.get(day) || { total: 0, count: 0 }
      dailyData.set(day, { total: existing.total + responseMinutes, count: existing.count + 1 })
    }
  })

  const data = Array.from(dailyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { total, count }]) => ({
      date: day,
      avgMinutes: Math.round(total / count),
    }))

  // Fill in missing days with 0
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })

  const filledData = last7Days.map((day) => {
    const found = data.find((d) => d.date === day)
    return found || { date: day, avgMinutes: 0 }
  })

  if (filledData.every((d) => d.avgMinutes === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No response time data yet</p>
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filledData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
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