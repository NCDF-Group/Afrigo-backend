import { sql } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../../db/client.js'
import { requireStaff } from '../../middleware/authenticate.js'

export const statsRouter = Router()

type Totals = { users: number; newUsers7d: number; newUsersToday: number; activeUsers15m: number; activeUsers24h: number; verifiedEmails: number; suspendedUsers: number; businesses: number; servicePartners: number; unverifiedBusinesses: number; pendingBusinesses: number; verifiedBusinesses: number; rejectedBusinesses: number; pendingDocuments: number; staff: number }

statsRouter.get('/', requireStaff('analytics:read'), async (_request, response) => {
  const [totals] = await db.execute<Totals>(sql`
    select
      (select count(*)::int from users where staff_role is null and status <> 'deleted') as "users",
      (select count(*)::int from users where staff_role is null and status <> 'deleted' and created_at > now() - interval '7 days') as "newUsers7d",
      (select count(*)::int from users where staff_role is null and status <> 'deleted' and created_at > date_trunc('day', now())) as "newUsersToday",
      (select count(*)::int from users where staff_role is null and last_active_at > now() - interval '15 minutes') as "activeUsers15m",
      (select count(*)::int from users where staff_role is null and last_active_at > now() - interval '24 hours') as "activeUsers24h",
      (select count(*)::int from users where staff_role is null and status <> 'deleted' and email_verified_at is not null) as "verifiedEmails",
      (select count(*)::int from users where status = 'suspended') as "suspendedUsers",
      (select count(*)::int from organisations where kind = 'business') as "businesses",
      (select count(*)::int from organisations where kind = 'service_partner') as "servicePartners",
      (select count(*)::int from organisations where verification_status = 'unverified') as "unverifiedBusinesses",
      (select count(*)::int from organisations where verification_status = 'pending') as "pendingBusinesses",
      (select count(*)::int from organisations where verification_status = 'verified') as "verifiedBusinesses",
      (select count(*)::int from organisations where verification_status = 'rejected') as "rejectedBusinesses",
      (select count(*)::int from documents where status = 'pending') as "pendingDocuments",
      (select count(*)::int from users where staff_role is not null) as "staff"
  `)
  const [countries, signups, platforms, recent] = await Promise.all([
    db.execute<{ iso2: string; name: string; region: string; enabled: boolean; users: number; newUsers7d: number; activeUsers24h: number; businesses: number; verifiedBusinesses: number; pendingBusinesses: number }>(sql`
      select c.iso2, c.name, c.region, c.enabled,
        coalesce(u.users, 0)::int as "users",
        coalesce(u.new_users, 0)::int as "newUsers7d",
        coalesce(u.active, 0)::int as "activeUsers24h",
        coalesce(o.businesses, 0)::int as "businesses",
        coalesce(o.verified, 0)::int as "verifiedBusinesses",
        coalesce(o.pending, 0)::int as "pendingBusinesses"
      from countries c
      left join (
        select lower(coalesce(m.country, (
            select o.country from organisation_members om join organisations o on o.id = om.organisation_id
            where om.user_id = m.id order by om.created_at limit 1
          ))) as country, count(*) as users,
          count(*) filter (where m.created_at > now() - interval '7 days') as new_users,
          count(*) filter (where m.last_active_at > now() - interval '24 hours') as active
        from users m where m.staff_role is null and m.status <> 'deleted' group by 1
      ) u on u.country = lower(c.iso2)
      left join (
        select lower(country) as country, count(*) as businesses,
          count(*) filter (where verification_status = 'verified') as verified,
          count(*) filter (where verification_status = 'pending') as pending
        from organisations group by 1
      ) o on o.country = lower(c.iso2)
      order by c.name`),
    db.execute<{ day: string; signups: number; businesses: number }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day,
        (select count(*)::int from users u where u.staff_role is null and u.created_at >= d.day and u.created_at < d.day + interval '1 day') as "signups",
        (select count(*)::int from organisations o where o.created_at >= d.day and o.created_at < d.day + interval '1 day') as "businesses"
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d(day)
      order by d.day`),
    db.execute<{ platform: string; users: number }>(sql`
      select coalesce(platform::text, 'web') as platform, count(*)::int as users
      from users where staff_role is null and status <> 'deleted' group by 1`),
    db.execute<{ id: string; action: string; actorEmail: string | null; createdAt: string; metadata: Record<string, unknown> }>(sql`
      select a.id, a.action, u.email as "actorEmail", a.created_at as "createdAt", a.metadata
      from audit_events a left join users u on u.id = a.actor_id
      where a.action in ('auth.register', 'auth.login', 'organisation.created', 'organisation.verification_requested', 'document.uploaded', 'organisation.colleague_invited', 'auth.email_verified')
      order by a.created_at desc limit 25`)
  ])
  response.set('Cache-Control', 'no-store').json({ at: new Date().toISOString(), totals, countries: [...countries], signups: [...signups], platforms: [...platforms], recent: [...recent] })
})
