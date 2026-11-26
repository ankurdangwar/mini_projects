import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USERS = [
  {
    email: 'admin@backeri.local',
    name: 'Elena Rostova (Head Pastry Chef & Owner)',
    phone: '+15550100001',
    password: 'password123',
    role: UserRole.ADMIN,
  },
  {
    email: 'baker@backeri.local',
    name: 'Marco Vance (Lead Baker)',
    phone: '+15550100002',
    password: 'password123',
    role: UserRole.BAKER,
  },
  {
    email: 'customer@backeri.local',
    name: 'Maya Lin',
    phone: '+15550100003',
    password: 'password123',
    role: UserRole.CUSTOMER,
  },
];

const SEED_PRODUCTS = [
  {
    slug: 'country-sourdough-boule',
    name: 'Country Sourdough Boule',
    description:
      '36-hour naturally leavened country loaf made with stone-milled organic wheat, blistered mahogany crust, and open custardy crumb.',
    category: 'Artisan Breads',
    basePriceCents: 950,
    leadTimeHours: 2,
    imageUrl: '/images/sourdough.svg',
    tags: ['Vegan', 'Naturally Leavened', 'Daily Bake'],
    variants: [
      { label: 'Classic Country (850g)', priceDeltaCents: 0 },
      { label: 'Roasted Garlic & Rosemary', priceDeltaCents: 150 },
      { label: 'Toasted Sesame & Seeded', priceDeltaCents: 150 },
    ],
  },
  {
    slug: 'dark-rye-caraway-loaf',
    name: 'Nordic Dark Rye & Caraway',
    description:
      'Hearty whole-grain dark rye loaf enriched with molasses, toasted caraway seeds, and orange zest.',
    category: 'Artisan Breads',
    basePriceCents: 1050,
    leadTimeHours: 4,
    imageUrl: '/images/rye.svg',
    tags: ['Vegan', 'Whole Grain'],
    variants: [
      { label: 'Whole Loaf (900g)', priceDeltaCents: 0 },
      { label: 'Pre-Sliced Loaf', priceDeltaCents: 50 },
    ],
  },
  {
    slug: 'cultured-butter-croissant',
    name: 'Cultured Butter Croissant',
    description:
      'Three-day laminated French pastry rolled with 84% Normandy-style cultured butter for honeycomb layers and shatter-crisp edges.',
    category: 'Viennoiserie',
    basePriceCents: 525,
    leadTimeHours: 1,
    imageUrl: '/images/croissant.svg',
    tags: ['Fresh Morning Batch', 'Bestseller'],
    variants: [
      { label: 'Single Croissant', priceDeltaCents: 0 },
      { label: 'Box of 4', priceDeltaCents: 1475 },
      { label: 'Box of 6', priceDeltaCents: 2375 },
    ],
  },
  {
    slug: 'cardamom-morning-bun',
    name: 'Swedish Cardamom Knot',
    description:
      'Brioche dough braided with freshly ground green cardamom pods, brown butter, and pearl sugar.',
    category: 'Viennoiserie',
    basePriceCents: 575,
    leadTimeHours: 1,
    imageUrl: '/images/cardamom.svg',
    tags: ['Signature', 'Warm Spice'],
    variants: [
      { label: 'Single Knot', priceDeltaCents: 0 },
      { label: 'Box of 4', priceDeltaCents: 1625 },
    ],
  },
  {
    slug: 'pain-au-chocolat',
    name: 'Valrhona Pain au Chocolat',
    description:
      'Flaky laminated pastry folded around twin batons of 70% Guanaja dark chocolate.',
    category: 'Viennoiserie',
    basePriceCents: 575,
    leadTimeHours: 1,
    imageUrl: '/images/pain-chocolat.svg',
    tags: ['70% Dark Chocolate'],
    variants: [
      { label: 'Single Pastry', priceDeltaCents: 0 },
      { label: 'Box of 4', priceDeltaCents: 1625 },
    ],
  },
  {
    slug: 'belgian-dark-chocolate-ganache-cake',
    name: 'Belgian Dark Chocolate Ganache Cake',
    description:
      'Three velvety cocoa sponge layers soaked in espresso syrup and finished in glossy 64% Belgian chocolate ganache. Ideal for custom inscriptions.',
    category: 'Celebration Cakes',
    basePriceCents: 5400,
    leadTimeHours: 24,
    imageUrl: '/images/chocolate-cake.svg',
    tags: ['24h Notice', 'Custom Inscription'],
    variants: [
      { label: '6-inch (Serves 8–10)', priceDeltaCents: 0 },
      { label: '6-inch Eggless', priceDeltaCents: 400 },
      { label: '8-inch (Serves 14–16)', priceDeltaCents: 2200 },
      { label: '8-inch Eggless', priceDeltaCents: 2600 },
    ],
  },
  {
    slug: 'pistachio-raspberry-celebration-cake',
    name: 'Roasted Pistachio & Raspberry Cake',
    description:
      'Bronte pistachio sponge layered with tart raspberry compote and whipped mascarpone vanilla bean buttercream.',
    category: 'Celebration Cakes',
    basePriceCents: 5800,
    leadTimeHours: 24,
    imageUrl: '/images/pistachio-cake.svg',
    tags: ['24h Notice', 'Custom Inscription', 'Chef Favorite'],
    variants: [
      { label: '6-inch (Serves 8–10)', priceDeltaCents: 0 },
      { label: '8-inch (Serves 14–16)', priceDeltaCents: 2400 },
      { label: '8-inch Gluten-Free', priceDeltaCents: 2900 },
    ],
  },
  {
    slug: 'tiered-bespoke-wedding-cake',
    name: 'Two-Tier Floral Celebration Cake',
    description:
      'Hand-piped vintage buttercream celebration cake customized to your inspiration photo and flavor profile. Requires 48 hours kitchen notice.',
    category: 'Celebration Cakes',
    basePriceCents: 13500,
    leadTimeHours: 48,
    imageUrl: '/images/tiered-cake.svg',
    tags: ['48h Notice', 'Upload Inspiration Pic'],
    variants: [
      { label: 'Vanilla Bean & Berry (Serves 25)', priceDeltaCents: 0 },
      { label: 'Salted Caramel Espresso (Serves 25)', priceDeltaCents: 1000 },
      { label: 'Eggless Vanilla & Berry (Serves 25)', priceDeltaCents: 1200 },
    ],
  },
  {
    slug: 'burnt-basque-cheesecake',
    name: 'San Sebastian Burnt Basque Cheesecake',
    description:
      'Deeply caramelized crust giving way to a molten, silky vanilla-bean cheesecake center. Naturally crustless.',
    category: 'Seasonal Tarts',
    basePriceCents: 4200,
    leadTimeHours: 12,
    imageUrl: '/images/basque-cheesecake.svg',
    tags: ['12h Notice', 'Gluten-Free Friendly'],
    variants: [
      { label: '6-inch Whole', priceDeltaCents: 0 },
      { label: '8-inch Whole', priceDeltaCents: 1600 },
    ],
  },
  {
    slug: 'meyer-lemon-meringue-tart',
    name: 'Torched Meyer Lemon Meringue Tart',
    description:
      'Almond pâte sucrée shell filled with bright Meyer lemon curd and crowned with toasted Swiss meringue peaks.',
    category: 'Seasonal Tarts',
    basePriceCents: 3800,
    leadTimeHours: 12,
    imageUrl: '/images/lemon-tart.svg',
    tags: ['12h Notice', 'Seasonal'],
    variants: [
      { label: '7-inch Tart (Serves 6–8)', priceDeltaCents: 0 },
      { label: '9-inch Tart (Serves 10–12)', priceDeltaCents: 1200 },
    ],
  },
];

const SLOT_WINDOWS = [
  { startTime: '08:00', endTime: '10:00', maxOrders: 8 },
  { startTime: '10:00', endTime: '12:00', maxOrders: 10 },
  { startTime: '12:00', endTime: '14:00', maxOrders: 10 },
  { startTime: '14:00', endTime: '16:00', maxOrders: 8 },
  { startTime: '16:00', endTime: '18:00', maxOrders: 6 },
];

async function seed() {
  console.log('Seeding Backeri database...');

  // 1. Seed users
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, phone: u.phone, role: u.role },
      create: {
        email: u.email,
        name: u.name,
        phone: u.phone,
        passwordHash,
        role: u.role,
      },
    });
  }
  console.log('  -> Seeded demo users (admin, baker, customer)');

  // 2. Seed products & variants
  for (const prod of SEED_PRODUCTS) {
    const upsertedProduct = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        description: prod.description,
        category: prod.category,
        basePriceCents: prod.basePriceCents,
        leadTimeHours: prod.leadTimeHours,
        imageUrl: prod.imageUrl,
        tags: prod.tags,
      },
      create: {
        slug: prod.slug,
        name: prod.name,
        description: prod.description,
        category: prod.category,
        basePriceCents: prod.basePriceCents,
        leadTimeHours: prod.leadTimeHours,
        imageUrl: prod.imageUrl,
        tags: prod.tags,
      },
    });

    for (const v of prod.variants) {
      await prisma.productVariant.upsert({
        where: {
          productId_label: {
            productId: upsertedProduct.id,
            label: v.label,
          },
        },
        update: { priceDeltaCents: v.priceDeltaCents },
        create: {
          productId: upsertedProduct.id,
          label: v.label,
          priceDeltaCents: v.priceDeltaCents,
        },
      });
    }
  }
  console.log(`  -> Seeded ${SEED_PRODUCTS.length} products with variants`);

  // 3. Seed 14 days of time slots starting today (UTC midnight Date)
  const today = new Date();
  const baseDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  let createdSlots = 0;
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    for (const win of SLOT_WINDOWS) {
      await prisma.timeSlot.upsert({
        where: {
          date_startTime_endTime: {
            date,
            startTime: win.startTime,
            endTime: win.endTime,
          },
        },
        update: {},
        create: {
          date,
          startTime: win.startTime,
          endTime: win.endTime,
          maxOrders: win.maxOrders,
          bookedOrders: 0,
          isClosed: false,
        },
      });
      createdSlots++;
    }
  }
  console.log(`  -> Ensured ${createdSlots} pickup/delivery time slots across 14 days`);

  // 4. Seed 3 sample orders if none exist yet so the Admin Dashboard & Prep Sheet look alive immediately
  const existingOrderCount = await prisma.order.count();
  if (existingOrderCount === 0) {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer@backeri.local' },
    });
    const sourdough = await prisma.product.findUniqueOrThrow({
      where: { slug: 'country-sourdough-boule' },
      include: { variants: true },
    });
    const croissant = await prisma.product.findUniqueOrThrow({
      where: { slug: 'cultured-butter-croissant' },
      include: { variants: true },
    });
    const chocoCake = await prisma.product.findUniqueOrThrow({
      where: { slug: 'belgian-dark-chocolate-ganache-cake' },
      include: { variants: true },
    });

    const tomorrow = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
    const morningSlot = await prisma.timeSlot.findFirstOrThrow({
      where: { date: tomorrow, startTime: '10:00' },
    });
    const afternoonSlot = await prisma.timeSlot.findFirstOrThrow({
      where: { date: tomorrow, startTime: '14:00' },
    });

    const sampleOrders = [
      {
        orderNumber: 'BK-1001',
        slotId: morningSlot.id,
        status: 'PAID' as const,
        fulfillmentType: 'PICKUP' as const,
        idempotencyKey: 'seed-order-1001',
        items: [
          {
            variantId: sourdough.variants[0].id,
            quantity: 2,
            unitPriceCents: sourdough.basePriceCents + sourdough.variants[0].priceDeltaCents,
            customNotes: { dietaryNotes: 'Please slice one loaf' },
          },
          {
            variantId: croissant.variants[1].id,
            quantity: 1,
            unitPriceCents: croissant.basePriceCents + croissant.variants[1].priceDeltaCents,
          },
        ],
      },
      {
        orderNumber: 'BK-1002',
        slotId: morningSlot.id,
        status: 'BAKING' as const,
        fulfillmentType: 'PICKUP' as const,
        idempotencyKey: 'seed-order-1002',
        items: [
          {
            variantId: chocoCake.variants[0].id,
            quantity: 1,
            unitPriceCents: chocoCake.basePriceCents + chocoCake.variants[0].priceDeltaCents,
            customNotes: {
              inscription: 'Happy Birthday Maya!',
              dietaryNotes: 'No nuts please',
            },
          },
          {
            variantId: sourdough.variants[0].id,
            quantity: 1,
            unitPriceCents: sourdough.basePriceCents + sourdough.variants[0].priceDeltaCents,
          },
        ],
      },
      {
        orderNumber: 'BK-1003',
        slotId: afternoonSlot.id,
        status: 'READY' as const,
        fulfillmentType: 'DELIVERY' as const,
        deliveryAddress: {
          line1: '428 Baker Street',
          city: 'San Francisco',
          postalCode: '94117',
          instructions: 'Leave with front desk',
        },
        idempotencyKey: 'seed-order-1003',
        items: [
          {
            variantId: croissant.variants[2].id,
            quantity: 2,
            unitPriceCents: croissant.basePriceCents + croissant.variants[2].priceDeltaCents,
          },
        ],
      },
    ];

    for (const s of sampleOrders) {
      const totalAmountCents = s.items.reduce(
        (sum, item) => sum + item.unitPriceCents * item.quantity,
        0
      );
      await prisma.order.create({
        data: {
          orderNumber: s.orderNumber,
          userId: customer.id,
          slotId: s.slotId,
          status: s.status,
          totalAmountCents,
          fulfillmentType: s.fulfillmentType,
          deliveryAddress: s.deliveryAddress,
          idempotencyKey: s.idempotencyKey,
          items: { create: s.items },
          payments: {
            create: {
              provider: 'sandbox',
              providerRef: `pi_${s.idempotencyKey}`,
              amountCents: totalAmountCents,
              status: 'SUCCEEDED',
              idempotencyKey: `pay_${s.idempotencyKey}`,
            },
          },
        },
      });
      await prisma.timeSlot.update({
        where: { id: s.slotId },
        data: { bookedOrders: { increment: 1 } },
      });
    }
    console.log('  -> Seeded 3 initial kitchen orders for tomorrow');
  }

  console.log('Backeri database seeded successfully.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
