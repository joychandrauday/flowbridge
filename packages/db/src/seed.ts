import { prisma } from './client'
import { hash } from 'bcryptjs'

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

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: { role: 'ADMIN', available: true },
    create: { workspaceId: workspace.id, userId: admin.id, role: 'ADMIN', available: true },
  })

  await prisma.member.upsert({
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

  // Create demo form
  const form = await prisma.form.upsert({
    where: { key: 'contact-form' },
    update: {},
    create: {
      workspaceId: workspace.id,
      key: 'contact-form',
      name: 'Contact Form',
      fields: [
        { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'John Doe' },
        { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'john@example.com' },
        { name: 'phone', label: 'Phone', type: 'tel', required: false, placeholder: '+1 (555) 000-0000' },
        { name: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Acme Inc.' },
        { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'How can we help?' },
        { name: 'hp_field', label: '', type: 'hidden', required: false }, // honeypot
      ],
      successMessage: 'Thanks for reaching out! We\'ll get back to you within 24 hours.',
      redirectUrl: 'https://flowbridge.example.com/thank-you',
      active: true,
    },
  })

  console.log('✅ Form created:', form.name)

  // Create demo workflow: Instant Lead Assignment
  const instantAssignmentWorkflow = await prisma.workflow.upsert({
    where: { id: 'wf_instant_assignment' },
    update: {},
    create: {
      id: 'wf_instant_assignment',
      workspaceId: workspace.id,
      name: 'Instant Lead Assignment',
      description: 'Assign new lead round-robin, create task, send Telegram notification',
      enabled: true,
      version: 1,
      definition: {
        trigger: { type: 'lead.created', config: {} },
        conditions: [],
        steps: [
          {
            id: 'step_assign',
            type: 'assign',
            config: { strategy: 'round_robin' },
            retry: { maxAttempts: 3, backoff: 'exponential' },
            onFailure: 'stop',
          },
          {
            id: 'step_task',
            type: 'create_task',
            config: {
              title: 'Contact new lead: {{lead.name}}',
              description: 'Lead source: {{lead.source}}\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
              dueInMinutes: 60,
            },
            retry: { maxAttempts: 3, backoff: 'exponential' },
            onFailure: 'continue',
          },
          {
            id: 'step_telegram',
            type: 'send_telegram',
            config: {
              message: '🎯 New lead assigned to you!\n\n*{{lead.name}}* ({{lead.email}})\nSource: {{lead.source}}\n\n[View Lead]({{lead.url}})',
              parseMode: 'Markdown',
            },
            retry: { maxAttempts: 3, backoff: 'exponential' },
            onFailure: 'continue',
          },
        ],
      },
    },
  })

  console.log('✅ Workflow created:', instantAssignmentWorkflow.name)

  // Create demo workflow: Follow-up Escalation
  const followupWorkflow = await prisma.workflow.upsert({
    where: { id: 'wf_followup_escalation' },
    update: {},
    create: {
      id: 'wf_followup_escalation',
      workspaceId: workspace.id,
      name: 'Follow-up Escalation (24h)',
      description: 'If lead still NEW after 24h, notify admin and create urgent task',
      enabled: true,
      version: 1,
      definition: {
        trigger: { type: 'lead.no_activity_for', config: { minutes: 1 } }, // 1 min for testing, 1440 for 24h
        conditions: [
          {
            operator: 'AND',
            conditions: [
              { field: 'status', operator: 'equals', value: 'NEW' },
            ],
          },
        ],
        steps: [
          {
            id: 'step_escalate_task',
            type: 'create_task',
            config: {
              title: 'URGENT: Follow up on {{lead.name}} (no activity 24h)',
              description: 'Lead has been NEW for 24 hours without contact.\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
              dueInMinutes: 30,
              assigneeStrategy: 'role',
              assigneeRole: 'ADMIN',
            },
            retry: { maxAttempts: 3, backoff: 'exponential' },
            onFailure: 'continue',
          },
          {
            id: 'step_escalate_telegram',
            type: 'send_telegram',
            config: {
              message: '⚠️ *ESCALATION*: Lead {{lead.name}} has had no activity for 24h!\n\nPlease follow up immediately.\n[View Lead]({{lead.url}})',
              parseMode: 'Markdown',
              sendToRole: 'ADMIN',
            },
            retry: { maxAttempts: 3, backoff: 'exponential' },
            onFailure: 'continue',
          },
        ],
      },
    },
  })

  console.log('✅ Workflow created:', followupWorkflow.name)

  // Create demo leads
  const leadsData = [
    { name: 'Sarah Johnson', email: 'sarah@techstart.io', phone: '+1-555-0101', source: 'website', company: 'TechStart', status: 'NEW' as const },
    { name: 'Michael Chen', email: 'mchen@growth.co', phone: '+1-555-0102', source: 'referral', company: 'GrowthCo', status: 'CONTACTED' as const },
    { name: 'Emily Rodriguez', email: 'emily@innovate.io', phone: '+1-555-0103', source: 'facebook', company: 'InnovateLabs', status: 'QUALIFIED' as const },
    { name: 'James Wilson', email: 'jwilson@scaleup.com', phone: '+1-555-0104', source: 'linkedin', company: 'ScaleUp Inc', status: 'WON' as const },
    { name: 'Lisa Park', email: 'lisa@venture.io', phone: '+1-555-0105', source: 'website', company: 'VentureLabs', status: 'LOST' as const },
  ]

  for (const leadData of leadsData) {
    const lead = await prisma.lead.upsert({
      where: { email: leadData.email },
      update: {},
      create: {
        workspaceId: workspace.id,
        ...leadData,
        data: { company: leadData.company, utm_source: leadData.source },
        assigneeId: leadData.status === 'NEW' ? null : agent1.id,
        firstContactedAt: leadData.status !== 'NEW' ? new Date() : null,
        lastActivityAt: new Date(),
      },
    })

    // Create activity
    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: 'lead_created',
        body: `Lead created from ${leadData.source}`,
        meta: { source: leadData.source },
      },
    })
  }

  console.log('✅ Demo leads created')

  // Create demo tasks
  await prisma.task.createMany({
    data: [
      {
        workspaceId: workspace.id,
        leadId: (await prisma.lead.findFirst({ where: { email: 'mchen@growth.co' } }))?.id,
        title: 'Follow up with Michael Chen',
        description: 'Discuss enterprise plan options',
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'OPEN',
        assigneeId: agent1.id,
      },
      {
        workspaceId: workspace.id,
        leadId: (await prisma.lead.findFirst({ where: { email: 'emily@innovate.io' } }))?.id,
        title: 'Send proposal to Emily Rodriguez',
        description: 'Custom pricing for 50 seats',
        dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        status: 'OPEN',
        assigneeId: agent1.id,
      },
      {
        workspaceId: workspace.id,
        title: 'Update CRM documentation',
        description: 'Document new workflow patterns',
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'OPEN',
        assigneeId: admin.id,
      },
    ],
    skipDuplicates: true,
  })

  console.log('✅ Demo tasks created')

  // Create demo integration (Telegram placeholder)
  await prisma.integration.upsert({
    where: { workspaceId_type_name: { workspaceId: workspace.id, type: 'telegram', name: 'Demo Bot' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      type: 'telegram',
      name: 'Demo Bot',
      configEnc: 'encrypted_placeholder', // Will be replaced with real encryption
    },
  })

  console.log('✅ Demo integration created')

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