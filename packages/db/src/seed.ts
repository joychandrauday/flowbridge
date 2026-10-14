import { prisma } from './client'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { deriveEncryptionKey, encryptJsonWithKey } from '@flowbridge/core'
import { DEMO_WORKFLOWS } from './demo-workflows'
import { DEMO_FORM } from './demo-form'
import { buildEmailIntegrationConfig } from './email-integration'

/**
 * Encrypt integration configs for storage (SPEC.md §3).
 * Falls back to plaintext JSON only when ENCRYPTION_KEY is missing (never
 * in production) so the demo seed still runs locally.
 */
function sealConfig(config: Record<string, unknown>): string {
  const keyMaterial = process.env.ENCRYPTION_KEY
  if (keyMaterial) {
    return encryptJsonWithKey(config, deriveEncryptionKey(keyMaterial))
  }
  return JSON.stringify(config)
}

async function main() {
  console.log('🌱 Seeding database...')

  // Create demo workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo-agency' },
    update: {},
    create: {
      name: 'Demo Agency',
      slug: 'demo-agency',
      branding: {
        logoUrl: '',
        primaryColor: '#10b981', // emerald
        removeBranding: false,
      },
      webhookSecret: 'whsec_demo_secret_key_for_testing',
    },
  })

  console.log('✅ Workspace created:', workspace.name)

  // Create demo users
  const ownerPassword = await hash('demo123', 12)
  const adminPassword = await hash('demo123', 12)
  const agentPassword = await hash('demo123', 12)

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.flowbridge' },
    update: {},
    create: {
      email: 'owner@demo.flowbridge',
      name: 'Rafi (Owner)',
      password: ownerPassword,
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.flowbridge' },
    update: {},
    create: {
      email: 'admin@demo.flowbridge',
      name: 'Sam (Admin)',
      password: adminPassword,
    },
  })

  const agent1 = await prisma.user.upsert({
    where: { email: 'agent1@demo.flowbridge' },
    update: {},
    create: {
      email: 'agent1@demo.flowbridge',
      name: 'Nila (Agent)',
      password: agentPassword,
    },
  })

  const agent2 = await prisma.user.upsert({
    where: { email: 'agent2@demo.flowbridge' },
    update: {},
    create: {
      email: 'agent2@demo.flowbridge',
      name: 'Kiran (Agent)',
      password: agentPassword,
    },
  })

  console.log('✅ Users created')

  // Create members
  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: { role: 'OWNER', available: true },
    create: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER', available: true },
  })

  const adminMember = await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: { role: 'ADMIN', available: true },
    create: { workspaceId: workspace.id, userId: admin.id, role: 'ADMIN', available: true },
  })

  const agent1Member = await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: agent1.id } },
    update: { role: 'AGENT', available: true, skills: ['english', 'spanish'] },
    create: { workspaceId: workspace.id, userId: agent1.id, role: 'AGENT', available: true, skills: ['english', 'spanish'] },
  })

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: agent2.id } },
    update: { role: 'AGENT', available: true, skills: ['english', 'french'] },
    create: { workspaceId: workspace.id, userId: agent2.id, role: 'AGENT', available: true, skills: ['english', 'french'] },
  })

  console.log('✅ Members created')

  // Create demo form (definition lives in demo-form.ts so the schema-drift
  // test can validate it without touching the DB). The `update` branch is
  // intentionally convergent — unlike workflows — so re-seeding repairs a form
  // whose stored fields/settings drift from the schema (which would otherwise
  // 404 the public page and 500 the intake endpoint).
  const demoFormFields = {
    name: DEMO_FORM.name,
    description: DEMO_FORM.description,
    fields: DEMO_FORM.fields as unknown as Prisma.InputJsonValue,
    settings: DEMO_FORM.settings as unknown as Prisma.InputJsonValue,
    successMessage: DEMO_FORM.successMessage,
    active: DEMO_FORM.active,
  }

  const form = await prisma.form.upsert({
    where: { key: DEMO_FORM.key },
    update: demoFormFields,
    create: {
      workspaceId: workspace.id,
      key: DEMO_FORM.key,
      ...demoFormFields,
    },
  })

  console.log('✅ Form created:', form.name)

  // Create demo workflows (definitions live in demo-workflows.ts so the
  // schema-drift test can validate them without touching the DB).
  for (const workflow of DEMO_WORKFLOWS) {
    const created = await prisma.workflow.upsert({
      where: { id: workflow.id },
      update: {},
      create: {
        id: workflow.id,
        workspaceId: workspace.id,
        name: workflow.name,
        description: workflow.description,
        enabled: true,
        version: 1,
        definition: workflow.definition as Prisma.InputJsonValue,
      },
    })

    console.log('✅ Workflow created:', created.name)
  }

  // Create demo leads
  const leadsData = [
    { name: 'Sarah Johnson', email: 'sarah@techstart.io', phone: '+1-555-0101', source: 'website', company: 'TechStart', status: 'NEW' as const },
    { name: 'Michael Chen', email: 'mchen@growth.co', phone: '+1-555-0102', source: 'referral', company: 'GrowthCo', status: 'CONTACTED' as const },
    { name: 'Emily Rodriguez', email: 'emily@innovate.io', phone: '+1-555-0103', source: 'facebook', company: 'InnovateLabs', status: 'QUALIFIED' as const },
    { name: 'James Wilson', email: 'jwilson@scaleup.com', phone: '+1-555-0104', source: 'linkedin', company: 'ScaleUp Inc', status: 'WON' as const },
    { name: 'Lisa Park', email: 'lisa@venture.io', phone: '+1-555-0105', source: 'website', company: 'VentureLabs', status: 'LOST' as const },
  ]

  for (const leadData of leadsData) {
    const { company, ...leadFields } = leadData
    const lead = await prisma.lead.upsert({
      where: { email: leadFields.email },
      update: {},
      create: {
        workspaceId: workspace.id,
        ...leadFields,
        data: { company, utm_source: leadFields.source },
        assigneeId: leadFields.status === 'NEW' ? null : agent1Member.id,
        firstContactedAt: leadFields.status !== 'NEW' ? new Date() : null,
        lastActivityAt: new Date(),
      },
    })

    // Create the intake activity once, so re-seeding does not pile up duplicates.
    const existingActivity = await prisma.activity.findFirst({
      where: { leadId: lead.id, type: 'lead_created' },
      select: { id: true },
    })
    if (!existingActivity) {
      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          type: 'lead_created',
          body: `Lead created from ${leadFields.source}`,
          meta: { source: leadFields.source },
        },
      })
    }
  }

  console.log('✅ Demo leads created')

  // Create demo tasks — only when the workspace has none, so re-seeding is idempotent.
  const existingTasks = await prisma.task.count({ where: { workspaceId: workspace.id } })
  if (existingTasks === 0) {
    const mchenLead = await prisma.lead.findFirst({ where: { email: 'mchen@growth.co' } })
    const emilyLead = await prisma.lead.findFirst({ where: { email: 'emily@innovate.io' } })

    await prisma.task.createMany({
      data: [
        {
          workspaceId: workspace.id,
          leadId: mchenLead?.id,
          title: 'Follow up with Michael Chen',
          description: 'Discuss enterprise plan options',
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'OPEN',
          assigneeId: agent1Member.id,
        },
        {
          workspaceId: workspace.id,
          leadId: emilyLead?.id,
          title: 'Send proposal to Emily Rodriguez',
          description: 'Custom pricing for 50 seats',
          dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          status: 'OPEN',
          assigneeId: agent1Member.id,
        },
        {
          workspaceId: workspace.id,
          title: 'Update CRM documentation',
          description: 'Document new workflow patterns',
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'OPEN',
          assigneeId: adminMember.id,
        },
      ],
      skipDuplicates: true,
    })
  }

  console.log('✅ Demo tasks created')

  // Create demo integrations: Telegram (placeholder / log-only) + email (from env).
  await prisma.integration.upsert({
    where: { workspaceId_type_name: { workspaceId: workspace.id, type: 'telegram', name: 'Demo Bot' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      type: 'telegram',
      name: 'Demo Bot',
      configEnc: sealConfig({
        botToken: process.env.TELEGRAM_BOT_TOKEN || 'log-only-demo-mode',
        defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
      }),
    },
  })

  // Create the email integration from SMTP_* env (see email-integration.ts).
  // Without an `email` integration the `send_email` executor fails with
  // "No email integration configured", so email steps never send. Env-driven
  // and encrypted at rest, so no credential is ever committed. `update: {}`
  // keeps a UI-configured integration intact on re-seed.
  const emailConfig = buildEmailIntegrationConfig(process.env)
  await prisma.integration.upsert({
    where: { workspaceId_type_name: { workspaceId: workspace.id, type: 'email', name: 'email' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      type: 'email',
      name: 'email',
      configEnc: sealConfig(emailConfig as unknown as Record<string, unknown>),
    },
  })

  console.log('✅ Demo integrations created (telegram + email:' + emailConfig.provider + ')')

  console.log('🎉 Seeding completed!')
  console.log('')
  console.log('Demo credentials:')
  console.log('  Owner:  owner@demo.flowbridge / demo123')
  console.log('  Admin:  admin@demo.flowbridge / demo123')
  console.log('  Agent:  agent1@demo.flowbridge / demo123')
  console.log('  Agent:  agent2@demo.flowbridge / demo123')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })