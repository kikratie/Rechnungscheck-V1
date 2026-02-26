/**
 * Create or promote a Super-Admin user.
 *
 * Usage:
 *   npx tsx server/src/scripts/create-superadmin.ts <email> [password]
 *
 * If the email already exists → promotes that user to isSuperAdmin=true
 * If the email does NOT exist → creates a new user in a system tenant
 *
 * The super-admin can access ALL tenants and is not bound to a single tenant.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email) {
    console.error('Usage: npx tsx server/src/scripts/create-superadmin.ts <email> [password]');
    process.exit(1);
  }

  // Check if user already exists
  const existing = await prisma.user.findFirst({ where: { email } });

  if (existing) {
    // Promote existing user
    await prisma.user.update({
      where: { id: existing.id },
      data: { isSuperAdmin: true },
    });
    console.log(`User ${email} promoted to Super-Admin.`);
  } else {
    if (!password) {
      console.error('New user requires a password: npx tsx server/src/scripts/create-superadmin.ts <email> <password>');
      process.exit(1);
    }

    // Ensure a system tenant exists
    let systemTenant = await prisma.tenant.findUnique({ where: { slug: 'system-admin' } });
    if (!systemTenant) {
      systemTenant = await prisma.tenant.create({
        data: {
          name: 'System Administration',
          slug: 'system-admin',
          onboardingComplete: true,
        },
      });
      console.log('Created system tenant "system-admin".');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        tenantId: systemTenant.id,
        email,
        passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        role: 'ADMIN',
        isSuperAdmin: true,
      },
    });

    console.log(`Super-Admin ${email} created in system tenant.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
