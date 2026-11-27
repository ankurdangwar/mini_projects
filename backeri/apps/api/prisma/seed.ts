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
    slug: 'belgian-dark-chocolate-ganache-cake',
    name: 'Belgian Dark Chocolate Truffle Cake',
    description:
      'Three velvety cocoa sponge layers soaked in espresso syrup and finished in glossy 64% Belgian chocolate ganache. Same-day custom message.',
    category: 'Cakes',
    basePriceCents: 69900, // ₹699
    leadTimeHours: 4,
    imageUrl: '/images/chocolate-cake.svg',
    tags: ['Eggless', 'Bestseller', 'Same-Day'],
    variants: [
      { label: '500g • Eggless', priceDeltaCents: 0 },
      { label: '500g • With Egg', priceDeltaCents: 0 },
      { label: '1kg • Eggless', priceDeltaCents: 55000 },
      { label: '1kg • With Egg', priceDeltaCents: 55000 },
      { label: '2kg • Eggless', priceDeltaCents: 125000 },
      { label: '2kg • With Egg', priceDeltaCents: 125000 },
    ],
  },
  {
    slug: 'pistachio-raspberry-celebration-cake',
    name: 'Roasted Pistachio & Raspberry Cake',
    description:
      'Iranian pistachio sponge layered with tart raspberry compote and whipped mascarpone vanilla buttercream.',
    category: 'Cakes',
    basePriceCents: 79900, // ₹799
    leadTimeHours: 6,
    imageUrl: '/images/pistachio-cake.svg',
    tags: ['Eggless', 'Sugar-Free', 'Chef Special'],
    variants: [
      { label: '500g • Eggless', priceDeltaCents: 0 },
      { label: '500g • With Egg', priceDeltaCents: 0 },
      { label: '1kg • Eggless', priceDeltaCents: 65000 },
      { label: '1kg • With Egg', priceDeltaCents: 65000 },
      { label: '2kg • Eggless', priceDeltaCents: 145000 },
    ],
  },
  {
    slug: 'tiered-bespoke-wedding-cake',
    name: 'Two-Tier Floral Celebration Cake',
    description:
      'Hand-piped vintage buttercream celebration cake customized to your inspiration photo and flavor profile. Requires 48h bakery notice.',
    category: 'Cakes',
    basePriceCents: 249900, // ₹2,499
    leadTimeHours: 48,
    imageUrl: '/images/tiered-cake.svg',
    tags: ['Eggless', '48h Notice', 'Custom Photo'],
    variants: [
      { label: '1kg • Eggless', priceDeltaCents: 0 },
      { label: '2kg • Eggless', priceDeltaCents: 140000 },
      { label: '2kg • With Egg', priceDeltaCents: 130000 },
    ],
  },
  {
    slug: 'burnt-basque-cheesecake',
    name: 'San Sebastian Burnt Basque Cheesecake',
    description:
      'Deeply caramelized crust giving way to a molten, silky vanilla-bean cheesecake center. Naturally gluten-free & available sugar-free.',
    category: 'Cakes',
    basePriceCents: 84900, // ₹849
    leadTimeHours: 4,
    imageUrl: '/images/basque-cheesecake.svg',
    tags: ['Eggless', 'Sugar-Free'],
    variants: [
      { label: '500g • Eggless', priceDeltaCents: 0 },
      { label: '500g • With Egg', priceDeltaCents: 0 },
      { label: '1kg • Eggless', priceDeltaCents: 65000 },
      { label: '2kg • Eggless', priceDeltaCents: 145000 },
    ],
  },
  {
    slug: 'cultured-butter-croissant',
    name: 'Cultured Butter Croissant',
    description:
      'Flaky 3-day laminated French croissant rolled with 84% cultured butter. Baked fresh every morning — ready in 30 mins.',
    category: 'Pastries',
    basePriceCents: 22000, // ₹220
    leadTimeHours: 0,
    imageUrl: '/images/croissant.svg',
    tags: ['Eggless', 'Ready in 30 mins', 'Bestseller'],
    variants: [
      { label: 'Single Croissant', priceDeltaCents: 0 },
      { label: 'Box of 4', priceDeltaCents: 58000 },
      { label: 'Box of 6', priceDeltaCents: 93000 },
    ],
  },
  {
    slug: 'pain-au-chocolat',
    name: 'Valrhona Pain au Chocolat',
    description:
      'Crisp laminated butter pastry folded around twin batons of 70% dark chocolate. Warm from the oven.',
    category: 'Pastries',
    basePriceCents: 26000, // ₹260
    leadTimeHours: 0,
    imageUrl: '/images/pain-chocolat.svg',
    tags: ['Eggless', 'Ready in 30 mins'],
    variants: [
      { label: 'Single Pastry', priceDeltaCents: 0 },
      { label: 'Box of 4', priceDeltaCents: 68000 },
    ],
  },
  {
    slug: 'meyer-lemon-meringue-tart',
    name: 'Zero-Sugar Berry & Lemon Tart',
    description:
      'Crisp almond shell filled with bright citrus curd and monk-fruit sweetened cream. Diabetic-friendly treat under ₹500.',
    category: 'Pastries',
    basePriceCents: 39000, // ₹390
    leadTimeHours: 0,
    imageUrl: '/images/lemon-tart.svg',
    tags: ['Eggless', 'Sugar-Free', 'Ready in 30 mins'],
    variants: [
      { label: 'Individual Tart (180g)', priceDeltaCents: 0 },
      { label: 'Box of 2 Tarts', priceDeltaCents: 35000 },
    ],
  },
  {
    slug: 'country-sourdough-boule',
    name: 'Country Sourdough Boule',
    description:
      '36-hour naturally leavened country loaf with organic stone-milled wheat, blistered crust, and custardy crumb.',
    category: 'Breads',
    basePriceCents: 36000, // ₹360
    leadTimeHours: 0,
    imageUrl: '/images/sourdough.svg',
    tags: ['Eggless', 'Sugar-Free', 'Ready in 30 mins'],
    variants: [
      { label: 'Classic Country (650g)', priceDeltaCents: 0 },
      { label: 'Roasted Garlic & Rosemary', priceDeltaCents: 6000 },
      { label: 'Toasted Sesame & Seeded', priceDeltaCents: 6000 },
    ],
  },
  {
    slug: 'dark-rye-caraway-loaf',
    name: 'Multigrain Dark Rye Sandwich Loaf',
    description:
      'High-fiber whole-grain dark rye loaf with zero added refined sugar, toasted caraway, and flax seeds.',
    category: 'Breads',
    basePriceCents: 39000, // ₹390
    leadTimeHours: 0,
    imageUrl: '/images/rye.svg',
    tags: ['Eggless', 'Sugar-Free', 'Ready in 30 mins'],
    variants: [
      { label: 'Pre-Sliced Loaf (700g)', priceDeltaCents: 0 },
      { label: 'Whole Unsliced Loaf', priceDeltaCents: 0 },
    ],
  },
  {
    slug: 'cardamom-morning-bun',
    name: 'Smoked Cheese & Herb Pull-Apart Puff',
    description:
      'Golden flaky savory Danish folded with aged cheddar, caramelized onion, and fresh thyme — hot cafe snack.',
    category: 'Savories',
    basePriceCents: 24000, // ₹240
    leadTimeHours: 0,
    imageUrl: '/images/cardamom.svg',
    tags: ['Eggless', 'Ready in 30 mins', 'Cafe Favorite'],
    variants: [
      { label: 'Single Puff', priceDeltaCents: 0 },
      { label: 'Pack of 3', priceDeltaCents: 42000 },
    ],
  },
  {
    slug: 'breakfast-croissant-coffee-combo',
    name: 'Morning Cafe Breakfast Combo',
    description:
      '2 Cultured Butter Croissants + 1 Valrhona Pain au Chocolat + 1 Savory Herb Puff packed warm for instant doorstep delivery.',
    category: 'Combos',
    basePriceCents: 49900, // ₹499
    leadTimeHours: 0,
    imageUrl: '/images/croissant.svg',
    tags: ['Eggless', 'Ready in 30 mins', 'Save ₹160'],
    variants: [
      { label: 'Solo / Duo Box (4 pcs)', priceDeltaCents: 0 },
      { label: 'Office Team Box (8 pcs)', priceDeltaCents: 45000 },
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
      update: { name: u.name, phone: u.phone, role: u.role, isActive: true, emailVerified: true },
      create: {
        email: u.email,
        name: u.name,
        phone: u.phone,
        passwordHash,
        role: u.role,
        isActive: true,
        emailVerified: true,
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

    const desiredLabels = prod.variants.map((v) => v.label);
    await prisma.productVariant.updateMany({
      where: {
        productId: upsertedProduct.id,
        label: { notIn: desiredLabels },
      },
      data: { isActive: false },
    });

    for (const v of prod.variants) {
      await prisma.productVariant.upsert({
        where: {
          productId_label: {
            productId: upsertedProduct.id,
            label: v.label,
          },
        },
        update: { priceDeltaCents: v.priceDeltaCents, isActive: true },
        create: {
          productId: upsertedProduct.id,
          label: v.label,
          priceDeltaCents: v.priceDeltaCents,
          isActive: true,
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
