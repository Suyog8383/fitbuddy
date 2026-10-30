// Promote an existing user to ADMIN. Run by a human with DB access:
//   npm run make-admin -- you@mail.com
// The only way to create the FIRST admin — no API endpoint can, so no
// attacker can either. Later admins can be promoted by an admin.
import { prisma } from '../db.ts';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  // console.* is fine here: a CLI talks to a human, not to log storage.
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

const { count } = await prisma.user.updateMany({
  where: { email },
  data: { role: 'ADMIN' },
});
await prisma.$disconnect();

if (count === 0) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
console.log(`${email} is now an ADMIN`);
