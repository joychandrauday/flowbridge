'use client'

import { prisma } from '@/lib/prisma'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

interface LeadsBySourceChartProps {
  workspaceId: string
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

export async function LeadsBySourceChart({ workspaceId }: LeadsBySourceChartProps) {
  const leadsBySource = await prisma.lead.groupBy({
    by: ['source'],
    where: { workspaceId },
    _count: { source: true },
    orderBy: { _count: { source: 'desc' } },
  })

  const data = leadsBySource.map((item) => ({
    name: item.source,
    value: item._count.source,
  }))

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No lead data yet</p>
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [value, 'leads']}
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}